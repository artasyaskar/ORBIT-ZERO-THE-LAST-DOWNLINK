/**
 * Cost-attribution experiment: hides categories of scene objects in the live immersive Fireline
 * cockpit and compares GPU timer-query time, XR callback JS time and XR frame interval for each.
 * Output is diagnostic only (desktop host GPU). Usage:
 *   node tests/virtual-quest/virtualQuestAblate.mjs [--skip-build]
 */
import { VirtualQuestPlayer } from './virtualQuestPlayer.mjs';
import { installPerfProbeInPage, summarizeRecording } from './virtualQuestPerfProbe.mjs';
import { launchImmersiveGame } from './virtualQuestHarness.mjs';

const game = await launchImmersiveGame({ skipBuild: process.argv.includes('--skip-build') });
const { page } = game;
try {
  const player = new VirtualQuestPlayer(page, { stereoEnabled: true });
  await player.initializeSession();
  await page.evaluate(installPerfProbeInPage);
  await player.lookAt('GLOBE');
  await page.waitForTimeout(3000);

  const fb = await page.evaluate(() => {
    const r = window.__ORBIT_ZERO__.getWebGLRenderer();
    const bl = r.xr.getSession().renderState.baseLayer;
    return { w: bl.framebufferWidth, h: bl.framebufferHeight, scale: r.xr.getFramebufferScaleFactor?.() };
  });
  console.log('framebuffer', JSON.stringify(fb));

  // Hide/restore helpers live in the page.
  await page.evaluate(() => {
    const api = window.__ORBIT_ZERO__;
    const r = api.getWebGLRenderer();
    // Find scene root via renderer.xr camera parent chain is unreliable; use the scene profile traversal root.
    let scene = null;
    r.render = new Proxy(r.render, {
      apply(target, thisArg, args) {
        if (!scene) scene = args[0];
        return Reflect.apply(target, thisArg, args);
      },
    });
    window.__ABL__ = {
      saved: [],
      getScene: () => scene,
      apply(kind) {
        this.restore();
        const s = scene;
        const vis = (o) => {
          this.saved.push([o, o.visible]);
          o.visible = false;
        };
        s.traverse((o) => {
          const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
          const nm = o.name || '';
          const isR = o.isMesh || o.isPoints || o.isLine || o.isSprite;
          let path = '';
          for (let p = o.parent; p; p = p.parent) path = (p.name || '') + '>' + path;
          if (!isR) return;
          if (kind === 'transparent' && mats.some((m) => m && m.transparent)) vis(o);
          if (kind === 'additive' && mats.some((m) => m && m.blending === 2)) vis(o);
          if (kind === 'armature' && path.includes('Armature')) vis(o);
          if (kind === 'starboardArc' && nm === 'StarboardAtmosphereGlowArc') vis(o);
          if (kind === 'cupolaArc' && nm === 'CupolaSkylightAtmosphereArc') vis(o);
          if (kind === 'glare' && nm === 'CanopyGlassGlare') vis(o);
          if (kind === 'starfield' && nm === 'CupolaStarfieldDome') vis(o);
          if (kind === 'globeGroup' && path.includes('Tactical Earth Globe')) vis(o);
          if (kind === 'holoTable' && /Holo/.test(path + nm)) vis(o);
          if (kind === 'hud' && /Briefing Panel|Telemetry HUD/.test(path)) vis(o);
          if (kind === 'allmeshes') vis(o);
        });
        return this.saved.length;
      },
      groups() {
        const out = [];
        const has = (o) => { let f = false; o.traverse((c) => { if (c.isMesh || c.isPoints || c.isLine || c.isSprite) f = true; }); return f; };
        for (const c1 of scene.children) {
          if (!has(c1)) continue;
          if (c1.children.length > 3 && /Root|Console/i.test(c1.name || '')) {
            for (const c2 of c1.children) if (has(c2)) out.push(c2);
          } else out.push(c1);
        }
        this.groupList = out;
        return out.map((g, i) => i + ':' + (g.parent?.name || '') + '>' + (g.name || g.type));
      },
      hideGroup(i) {
        this.restore();
        const g = this.groupList[i];
        this.saved.push([g, g.visible]);
        g.visible = false;
        return 1;
      },
      hideLights() {
        this.restore();
        scene.traverse((o) => { if (o.isLight && !o.isAmbientLight) { this.saved.push([o, o.visible]); o.visible = false; } });
        return this.saved.length;
      },
      restore() {
        for (const [o, v] of this.saved) o.visible = v;
        this.saved = [];
      },
    };
  });
  // trigger one render so the proxy captures scene
  await page.waitForTimeout(500);

  const results = [];
  if (process.argv.includes('--groups')) {
    const names = await page.evaluate(() => window.__ABL__.groups());
    console.log(names.join('\n'));
    const run = async (name, fn) => {
      const hidden = await page.evaluate(fn);
      await page.waitForTimeout(1200);
      await page.evaluate(() => window.__PERF__.begin('abl', false));
      await page.waitForTimeout(3000);
      const s = summarizeRecording(await page.evaluate(() => window.__PERF__.end()), 5);
      console.log(JSON.stringify({ name, hidden, gpu: s.gpuTime_ms?.median, js: s.xrCallbackJs_ms.median, xr: s.xrFrameInterval_ms.median, draws: s.perXrFrame.glDrawCommands }));
    };
    await run('BASE', () => (window.__ABL__.restore(), 0));
    await run('lights', () => window.__ABL__.hideLights());
    for (let i = 0; i < names.length; i++) {
      await run(names[i], new Function('return window.__ABL__.hideGroup(' + i + ')'));
      if (i % 4 === 3) await run('BASE', () => (window.__ABL__.restore(), 0));
    }
    await run('BASE', () => (window.__ABL__.restore(), 0));
    await game.cleanup();
    process.exit(0);
  }
  const order = ['none','starboardArc','none','cupolaArc','none','glare','none','starfield','none','globeGroup','none','holoTable','none','hud','none','armature','none','additive','none','transparent','none'];
  for (const kind of order) {
    const hidden = await page.evaluate((k) => (k === 'none' ? (window.__ABL__.restore(), 0) : window.__ABL__.apply(k)), kind);
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.__PERF__.begin('abl', false));
    await page.waitForTimeout(4000);
    const rec = await page.evaluate(() => window.__PERF__.end());
    const s = summarizeRecording(rec, 5);
    results.push({
      hidden: kind,
      objectsHidden: hidden,
      xrMedian: s.xrFrameInterval_ms.median,
      xrP95: s.xrFrameInterval_ms.p95,
      jsMedian: s.xrCallbackJs_ms.median,
      gpuMedian: s.gpuTime_ms?.median ?? null,
      glDraws: s.perXrFrame.glDrawCommands,
    });
    console.log(JSON.stringify(results[results.length - 1]));
  }
  await page.evaluate(() => window.__ABL__.restore());
} catch (e) {
  console.error('[ablate fatal]', e);
  process.exitCode = 1;
} finally {
  await game.cleanup();
}


