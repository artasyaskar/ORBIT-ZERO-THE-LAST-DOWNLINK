/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Frame-rate monitor and adaptive quality.
 *
 * Always on (cheap): records every frame time, and in a headset applies the QualityGovernor policy
 * (perfStats.ts): a sustained slowdown at 90/120 Hz asks for the next supported rate down to 72 Hz, and a
 * session that averaged under 90% of 72 Hz makes the next session render at 0.8 resolution. Foveation is left
 * at three.js's default (maximum), set when each session starts.
 *
 * With `?perf=1`: a readout (DOM on the flat page, a small head-locked panel in the headset) with FPS
 * average and 1% low, frame time, draw calls and triangles per eye, JS heap and texture memory, and an
 * automatic 60-second summary (also logged and exposed as window.__ORBIT_PERF__.summary60).
 */

import {
  CanvasTexture,
  createSystem,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Material,
  type Object3D,
  type Texture,
} from '@iwsdk/core';
import { FrameRing, QualityGovernor, REDUCED_FRAMEBUFFER_SCALE, summarizeFrames, type FrameSummary } from './perfStats';

const SUMMARY_WINDOW_SEC = 60;
const RING_CAPACITY = 120 * SUMMARY_WINDOW_SEC; // a full minute at up to 120 Hz
const READOUT_EVERY_MS = 500;
const TEXTURE_SCAN_EVERY_MS = 5000;
const GOVERNOR_STEP_SEC = 1;

interface XRSessionRates {
  frameRate?: number;
  supportedFrameRates?: Float32Array | number[];
  updateTargetFrameRate?: (rate: number) => Promise<void>;
}

export interface PerfSnapshot {
  fpsAvg: number;
  fpsLow1: number;
  frameMsAvg: number;
  frameMsMax: number;
  drawsPerEye: number;
  trisPerEye: number;
  multiview: boolean;
  presenting: boolean;
  displayHz: number | null;
  jsHeapMb: number | null;
  textureMb: number;
  textures: number;
  framebufferScale: number;
}

export class PerfMonitorSystem extends createSystem({}) {
  private readonly ring = new FrameRing(RING_CAPACITY);
  private readonly sessionRing = new FrameRing(RING_CAPACITY);
  private lastFrameAt = 0;
  private lastReadoutAt = 0;
  private lastTextureScanAt = -Infinity;
  private textureMb = 0;
  private summaryStartAt = 0;
  private summary60: (FrameSummary & { drawsPerEye: number; trisPerEye: number }) | null = null;
  private governor = new QualityGovernor();
  private governorClock = 0;
  private governorFrames = 0;
  private framebufferScale = 1;
  private hudEnabled = false;
  private domReadout: HTMLDivElement | null = null;
  private xrPanel: Mesh | null = null;
  private xrCanvas: HTMLCanvasElement | null = null;
  private xrTexture: CanvasTexture | null = null;
  private lastSnapshot: PerfSnapshot | null = null;
  private readonly seenTextures = new Set<Texture>();
  private cleanups: Array<() => void> = [];
  /** Counts of the last main-scene render. Systems update before it, and other passes reset renderer.info. */
  private lastCalls = 0;
  private lastTriangles = 0;

  init(): void {
    this.hudEnabled = typeof location !== 'undefined' && new URLSearchParams(location.search).get('perf') === '1';
    this.summaryStartAt = performance.now();
    const scene = this.scene;
    const previousAfterRender = scene.onAfterRender;
    scene.onAfterRender = (...args: Parameters<typeof scene.onAfterRender>) => {
      this.lastCalls = this.renderer.info.render.calls;
      this.lastTriangles = this.renderer.info.render.triangles;
      previousAfterRender.apply(scene, args);
    };
    this.cleanups.push(() => { scene.onAfterRender = previousAfterRender; });
    const xr = this.renderer.xr;
    const onStart = () => {
      this.governor = new QualityGovernor();
      this.governorClock = 0;
      this.governorFrames = 0;
      this.sessionRing.clear();
      this.restartSummary();
    };
    const onEnd = () => {
      const avg = summarizeFrames(this.sessionRing.values()).fpsAvg;
      if (QualityGovernor.nextSessionReduced(avg) && this.framebufferScale !== REDUCED_FRAMEBUFFER_SCALE) {
        // three.js takes the framebuffer scale only before a session starts: it applies on the next ENTER VR.
        this.framebufferScale = REDUCED_FRAMEBUFFER_SCALE;
        xr.setFramebufferScaleFactor(REDUCED_FRAMEBUFFER_SCALE);
        console.info(`[perf] last VR session averaged ${avg.toFixed(1)} fps: the next one renders at ${REDUCED_FRAMEBUFFER_SCALE} resolution`);
      }
      this.restartSummary();
    };
    xr.addEventListener('sessionstart', onStart);
    xr.addEventListener('sessionend', onEnd);
    this.cleanups.push(() => {
      xr.removeEventListener('sessionstart', onStart);
      xr.removeEventListener('sessionend', onEnd);
    });
    if (typeof window !== 'undefined') {
      (window as unknown as { __ORBIT_PERF__?: unknown }).__ORBIT_PERF__ = {
        snapshot: () => this.lastSnapshot ?? this.takeSnapshot(performance.now()),
        summary60: () => this.summary60,
        framebufferScale: () => this.framebufferScale,
      };
    }
    if (this.hudEnabled && typeof document !== 'undefined') {
      const el = document.createElement('div');
      el.id = 'oz-perf-hud';
      el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99998;padding:6px 9px;background:rgba(2,6,23,0.82);color:#e2e8f0;font:12px/1.35 ui-monospace,monospace;border:1px solid #38bdf8;border-radius:6px;white-space:pre;pointer-events:none;';
      document.body.appendChild(el);
      this.domReadout = el;
      this.cleanups.push(() => el.remove());
    }
  }

  destroy(): void {
    for (const fn of this.cleanups) fn();
    this.cleanups = [];
    this.xrPanel?.removeFromParent();
  }

  update(): void {
    const now = performance.now();
    if (this.lastFrameAt > 0) {
      const ms = now - this.lastFrameAt;
      // A gap over 1 s is a pause (tab hidden, headset off), not a frame.
      if (ms < 1000) {
        this.ring.push(ms);
        if (this.renderer.xr.isPresenting) this.sessionRing.push(ms);
        this.governorFrames++;
        this.governorClock += ms / 1000;
      }
    }
    this.lastFrameAt = now;

    if (this.renderer.xr.isPresenting && this.governorClock >= GOVERNOR_STEP_SEC) this.runGovernor();

    if (!this.summary60 && now - this.summaryStartAt >= SUMMARY_WINDOW_SEC * 1000 && this.ring.size > 0) {
      const s = summarizeFrames(this.ring.values(Math.min(this.ring.size, RING_CAPACITY)));
      const snap = this.takeSnapshot(now);
      this.summary60 = { ...s, drawsPerEye: snap.drawsPerEye, trisPerEye: snap.trisPerEye };
      console.info(`[perf] ${SUMMARY_WINDOW_SEC} s summary (${snap.presenting ? 'VR' : 'flat'}): avg ${s.fpsAvg.toFixed(1)} fps, 1% low ${s.fpsLow1.toFixed(1)} fps, worst ${s.frameMsMax.toFixed(1)} ms, ${snap.drawsPerEye} draws / ${snap.trisPerEye} tris per eye`);
    }

    if (this.hudEnabled && now - this.lastReadoutAt >= READOUT_EVERY_MS) {
      this.lastReadoutAt = now;
      this.lastSnapshot = this.takeSnapshot(now);
      this.renderReadout(this.lastSnapshot);
    }
  }

  private restartSummary(): void {
    this.ring.clear();
    this.summary60 = null;
    this.summaryStartAt = performance.now();
  }

  private runGovernor(): void {
    const fps = this.governorFrames / this.governorClock;
    const step = this.governorClock;
    this.governorClock = 0;
    this.governorFrames = 0;
    const session = this.renderer.xr.getSession() as (XRSession & XRSessionRates) | null;
    if (!session?.frameRate || !session.supportedFrameRates || typeof session.updateTargetFrameRate !== 'function') return;
    const action = this.governor.evaluate(fps, session.frameRate, Array.from(session.supportedFrameRates), step);
    if (action.type !== 'lower-refresh') return;
    console.info(`[perf] ${fps.toFixed(1)} fps at ${session.frameRate} Hz: asking for ${action.toHz} Hz`);
    session.updateTargetFrameRate(action.toHz).catch((err: unknown) => console.warn('[perf] refresh-rate change refused:', err));
  }

  private takeSnapshot(now: number): PerfSnapshot {
    const recent = summarizeFrames(this.ring.values(240));
    const r = this.renderer;
    const presenting = r.xr.isPresenting;
    const multiview = presenting && Boolean((r.xr as unknown as { isMultiview?: boolean }).isMultiview);
    // Without multiview three.js draws each eye separately inside one render(); with it, once for both.
    const perEye = presenting && !multiview ? 0.5 : 1;
    const session = r.xr.getSession() as (XRSession & XRSessionRates) | null;
    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    if (now - this.lastTextureScanAt >= TEXTURE_SCAN_EVERY_MS) {
      this.lastTextureScanAt = now;
      this.textureMb = this.estimateTextureMb();
    }
    return {
      fpsAvg: recent.fpsAvg,
      fpsLow1: summarizeFrames(this.ring.values(1200)).fpsLow1,
      frameMsAvg: recent.frameMsAvg,
      frameMsMax: recent.frameMsMax,
      drawsPerEye: Math.round(this.lastCalls * perEye),
      trisPerEye: Math.round(this.lastTriangles * perEye),
      multiview,
      presenting,
      displayHz: session?.frameRate ?? null,
      jsHeapMb: heap ? heap / 1048576 : null,
      textureMb: this.textureMb,
      textures: r.info.memory.textures,
      framebufferScale: this.framebufferScale,
    };
  }

  /** Approximate GPU bytes of the textures the scene's materials reference (RGBA8, +1/3 for mipmaps). */
  private estimateTextureMb(): number {
    this.seenTextures.clear();
    let bytes = 0;
    this.scene.traverse((o: Object3D) => {
      const material = (o as Object3D & { material?: Material | Material[] }).material;
      if (!material) return;
      for (const m of Array.isArray(material) ? material : [material]) {
        for (const value of Object.values(m as unknown as Record<string, unknown>)) {
          const tex = value as Texture | null;
          if (!tex || !(tex as { isTexture?: boolean }).isTexture || this.seenTextures.has(tex)) continue;
          this.seenTextures.add(tex);
          const img = tex.image as { width?: number; height?: number } | undefined;
          if (img?.width && img.height) bytes += img.width * img.height * 4 * (tex.generateMipmaps ? 4 / 3 : 1);
        }
      }
    });
    return bytes / 1048576;
  }

  private renderReadout(s: PerfSnapshot): void {
    const lines = [
      `FPS ${s.fpsAvg.toFixed(0)} avg | ${s.fpsLow1.toFixed(0)} 1% low${s.displayHz ? ` | ${s.displayHz} Hz` : ''}`,
      `FRAME ${s.frameMsAvg.toFixed(1)} ms avg | ${s.frameMsMax.toFixed(1)} max`,
      `PER EYE ${s.drawsPerEye} draws | ${(s.trisPerEye / 1000).toFixed(1)}k tris${s.presenting ? (s.multiview ? ' | multiview' : ' | no multiview') : ''}`,
      `HEAP ${s.jsHeapMb === null ? 'n/a' : `${s.jsHeapMb.toFixed(0)} MB`} | TEX ${s.textureMb.toFixed(0)} MB (${s.textures})${s.framebufferScale !== 1 ? ` | RES x${s.framebufferScale}` : ''}`,
      this.summary60
        ? `60s: ${this.summary60.fpsAvg.toFixed(1)} avg | ${this.summary60.fpsLow1.toFixed(1)} 1% low | ${this.summary60.frameMsMax.toFixed(0)} ms worst`
        : `60s summary in ${Math.max(0, Math.ceil(SUMMARY_WINDOW_SEC - (performance.now() - this.summaryStartAt) / 1000))} s`,
    ];
    if (this.domReadout) this.domReadout.textContent = lines.join('\n');
    if (s.presenting) this.drawXrPanel(lines);
    else if (this.xrPanel) this.xrPanel.visible = false;
  }

  private drawXrPanel(lines: string[]): void {
    if (!this.xrPanel) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 200;
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      const material = new MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
      const panel = new Mesh(new PlaneGeometry(0.2, 0.078), material);
      panel.name = 'PerfHudPanel';
      panel.renderOrder = 10000;
      panel.raycast = () => {};
      panel.position.set(-0.11, -0.13, -0.5); // lower left of the view, head-locked
      this.camera.add(panel);
      this.xrPanel = panel;
      this.xrCanvas = canvas;
      this.xrTexture = texture;
    }
    this.xrPanel.visible = true;
    const ctx = this.xrCanvas!.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 512, 200);
    ctx.fillStyle = 'rgba(2,6,23,0.85)';
    ctx.fillRect(0, 0, 512, 200);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 508, 196);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 22px monospace';
    lines.forEach((line, i) => ctx.fillText(line.slice(0, 40), 12, 34 + i * 36));
    this.xrTexture!.needsUpdate = true;
  }
}
