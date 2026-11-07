/**
 * Passive in-page frame probe for the Virtual Quest lab.
 *
 * Why this exists: the original Stage 8 measured `await new Promise(r => requestAnimationFrame(r))`
 * in a loop that was evaluated through Playwright right after a debrief screenshot. That measures
 * window rAF (not XRSession rAF), at an arbitrary scene state, with no warm-up, and the assertion
 * was never evaluated against a threshold. This probe records, without awaiting anything inside
 * the measured window:
 *
 *   1. XRSession.requestAnimationFrame callback intervals (actual XR frame cadence),
 *   2. window.requestAnimationFrame intervals (browser display cadence, separately),
 *   3. JS time spent inside the XR frame callback (ECS update + three.js command submission),
 *   4. GL draw commands actually issued per XR frame (ground truth, counted on the GL context),
 *   5. renderer.info calls/triangles and render() invocations per frame,
 *   6. GPU time via EXT_disjoint_timer_query_webgl2 only when the extension exists and is valid.
 *
 * Samples are sliced into labelled windows so that "static cockpit", "three staged cubes",
 * "holographic inspection" and "live downlink" can be reported separately. Windows are only
 * trustworthy when the Node driver sits in `page.waitForTimeout` (no in-page automation) while
 * they are recording. Windows recorded while the driver is dispatching hand input are labelled
 * `driverActive` and must not be compared against a frame budget.
 *
 * All of this is a DESKTOP EMULATOR measurement. It is not Quest GPU/CPU performance.
 */

/** Runs inside the page. Idempotent. */
export function installPerfProbeInPage() {
  if (window.__PERF__) return window.__PERF__.info();
  const api = window.__ORBIT_ZERO__;
  const renderer = api.getWebGLRenderer();
  const session = renderer.xr.getSession();
  if (!session) throw new Error('perf probe requires an active XRSession');
  const gl = renderer.getContext();

  // ---- ground-truth GL draw counting -------------------------------------------------------
  const counters = { draws: 0, tris: 0 };
  const proto = Object.getPrototypeOf(gl);
  const patchDraw = (name, countIndex) => {
    const orig = proto[name];
    if (typeof orig !== 'function' || orig.__perfPatched) return;
    const wrapped = function (mode, a, b, ...rest) {
      counters.draws++;
      const count = countIndex === 'a' ? a : b;
      if (mode === gl.TRIANGLES) counters.tris += Math.floor(count / 3);
      else if (mode === gl.TRIANGLE_STRIP || mode === gl.TRIANGLE_FAN) counters.tris += Math.max(0, count - 2);
      return orig.call(this, mode, a, b, ...rest);
    };
    wrapped.__perfPatched = true;
    proto[name] = wrapped;
  };
  // drawArrays(mode, first, count) / drawElements(mode, count, type, offset)
  patchDraw('drawArrays', 'b');
  patchDraw('drawElements', 'a');
  // Instanced: drawArraysInstanced(mode, first, count, instances) / drawElementsInstanced(mode, count, type, offset, instances)
  const patchInstanced = (name, countIdx, instIdx) => {
    const orig = proto[name];
    if (typeof orig !== 'function' || orig.__perfPatched) return;
    const wrapped = function (...args) {
      counters.draws++;
      const mode = args[0];
      const count = args[countIdx];
      const inst = args[instIdx] || 1;
      if (mode === gl.TRIANGLES) counters.tris += Math.floor(count / 3) * inst;
      return orig.apply(this, args);
    };
    wrapped.__perfPatched = true;
    proto[name] = wrapped;
  };
  patchInstanced('drawArraysInstanced', 2, 3);
  patchInstanced('drawElementsInstanced', 1, 4);

  // ---- GPU timer queries (optional) ----------------------------------------------------------
  const ext = gl.getExtension && gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const gpu = { available: Boolean(ext), pending: [], results: [], disjoint: 0 };

  // ---- recording state -------------------------------------------------------------------------
  let recording = null; // { label, driverActive, xr: [], win: [], ... }
  const done = [];
  const state = { xrFrames: 0, lastXrT: null, lastWinT: null, renderInvocations: 0, renderMsAcc: 0, lastHeap: null };
  const views = { count: null, handedness: [], ipdFromPose: null };

  const origRender = renderer.render.bind(renderer);
  let activeQuery = null;
  renderer.render = (...args) => {
    state.renderInvocations++;
    let q = null;
    if (ext && !activeQuery && recording) {
      try {
        q = gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        activeQuery = q;
      } catch {
        q = null;
      }
    }
    const rt0 = performance.now();
    const out = origRender(...args);
    state.renderMsAcc += performance.now() - rt0;
    if (q) {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      activeQuery = null;
      gpu.pending.push(q);
    }
    return out;
  };

  const drainGpu = () => {
    if (!ext) return;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    if (disjoint) {
      gpu.disjoint++;
      for (const q of gpu.pending) gl.deleteQuery(q);
      gpu.pending.length = 0;
      return;
    }
    while (gpu.pending.length) {
      const q = gpu.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      gl.deleteQuery(q);
      gpu.pending.shift();
      if (recording) recording.gpuMs.push(ns / 1e6);
    }
  };

  // ---- XRSession.requestAnimationFrame wrapper ----------------------------------------------------
  const origXrRaf = session.requestAnimationFrame.bind(session);
  session.requestAnimationFrame = (cb) =>
    origXrRaf((t, frame) => {
      const start = performance.now();
      const drawsBefore = counters.draws;
      const trisBefore = counters.tris;
      const rendersBefore = state.renderInvocations;
      state.renderMsAcc = 0;
      // Capture authentic view / input-source facts once per recording from the live frame.
      if (views.count === null || (recording && recording.needViews)) {
        try {
          const ref = renderer.xr.getReferenceSpace();
          const pose = frame.getViewerPose(ref);
          views.count = pose ? pose.views.length : 0;
          views.eyes = pose ? Array.from(pose.views).map((v) => v.eye) : [];
          if (pose && pose.views.length === 2) {
            const a = pose.views[0].transform.position;
            const b = pose.views[1].transform.position;
            views.ipdFromPose = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
          }
          views.handedness = [];
          views.jointCounts = {};
          for (const src of session.inputSources) {
            views.handedness.push({ handedness: src.handedness, hasHand: Boolean(src.hand), targetRayMode: src.targetRayMode });
            if (src.hand) {
              const joints = Array.from(src.hand.values());
              let valid = 0;
              let radiusOk = 0;
              for (const j of joints) {
                const jp = frame.getJointPose(j, ref);
                if (jp) {
                  valid++;
                  if (jp.radius > 0) radiusOk++;
                }
              }
              views.jointCounts[src.handedness] = { total: joints.length, withPose: valid, withRadius: radiusOk };
            }
          }
        } catch (e) {
          views.error = String(e);
        }
        if (recording) recording.needViews = false;
      }
      const t0 = performance.now();
      try {
        cb(t, frame);
      } finally {
        const t1 = performance.now();
        if (recording) {
          recording.xr.push(t);
          recording.jsMs.push(t1 - t0);
          recording.glDraws.push(counters.draws - drawsBefore);
          recording.glTris.push(counters.tris - trisBefore);
          recording.renders.push(state.renderInvocations - rendersBefore);
          recording.infoCalls.push(renderer.info.render.calls);
          recording.infoTris.push(renderer.info.render.triangles);
          recording.cbStart.push(start);
          recording.renderMs.push(state.renderMsAcc);
          const heap = performance.memory ? performance.memory.usedJSHeapSize : 0;
          if (state.lastHeap !== null && heap > state.lastHeap) recording.heapAllocBytes += heap - state.lastHeap;
          if (state.lastHeap !== null && heap < state.lastHeap) recording.gcDrops++;
          state.lastHeap = heap;
        }
        drainGpu();
      }
    });

  // ---- window.requestAnimationFrame passive loop ----------------------------------------------------------
  const winLoop = (t) => {
    if (recording) recording.win.push(t);
    requestAnimationFrame(winLoop);
  };
  requestAnimationFrame(winLoop);

  window.__PERF__ = {
    info: () => ({
      gpuTimerExtension: Boolean(ext),
      sessionSupportedFrameRates: session.supportedFrameRates ? Array.from(session.supportedFrameRates) : null,
      sessionFrameRate: session.frameRate ?? null,
      sessionVisibility: session.visibilityState,
      renderStateBaseLayerFramebuffer: Boolean(session.renderState && session.renderState.baseLayer),
      autoReset: renderer.info.autoReset,
      views: { ...views },
      userAgent: navigator.userAgent,
    }),
    begin(label, driverActive) {
      gpu.pending.length = 0;
      recording = {
        label,
        driverActive: Boolean(driverActive),
        needViews: true,
        xr: [],
        win: [],
        jsMs: [],
        glDraws: [],
        glTris: [],
        renders: [],
        infoCalls: [],
        infoTris: [],
        cbStart: [],
        renderMs: [],
        heapAllocBytes: 0,
        gcDrops: 0,
        gpuMs: [],
        wallStart: performance.now(),
      };
    },
    end() {
      if (!recording) return null;
      drainGpu();
      const r = recording;
      r.wallMs = performance.now() - r.wallStart;
      recording = null;
      done.push(r.label);
      return r;
    },
    gpuInfo: () => ({ available: gpu.available, disjointEvents: gpu.disjoint }),
    viewFacts: () => ({ ...views }),
  };
  return window.__PERF__.info();
}

// ---------------------------------------------------------------------------------------------
// Node-side statistics
// ---------------------------------------------------------------------------------------------

export function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1));
  return sortedAsc[idx];
}

export function describe(values, digits = 2) {
  if (!values || values.length === 0) return { n: 0 };
  const s = [...values].sort((a, b) => a - b);
  const r = (x) => Number(x.toFixed(digits));
  return {
    n: s.length,
    median: r(percentile(s, 50)),
    p90: r(percentile(s, 90)),
    p95: r(percentile(s, 95)),
    p99: r(percentile(s, 99)),
    max: r(s[s.length - 1]),
    min: r(s[0]),
    mean: r(s.reduce((a, b) => a + b, 0) / s.length),
  };
}

export function intervals(timestamps) {
  const out = [];
  for (let i = 1; i < timestamps.length; i++) out.push(timestamps[i] - timestamps[i - 1]);
  return out;
}

export function countOver(values, thresholds = [13.9, 27.8, 50]) {
  const out = {};
  for (const t of thresholds) out[`gt${t}ms`] = values.filter((v) => v > t).length;
  return out;
}

/** Convert a raw recording from the page into a report block. */
export function summarizeRecording(rec, warmupFrames = 0) {
  const xrIv = intervals(rec.xr).slice(warmupFrames);
  const winIv = intervals(rec.win);
  const sl = (a) => a.slice(warmupFrames);
  const med = (a) => (a.length ? describe(a, 1).median : null);
  return {
    label: rec.label,
    driverActive: rec.driverActive,
    wallClockSec: Number((rec.wallMs / 1000).toFixed(2)),
    xrFrameInterval_ms: { ...describe(xrIv), ...countOver(xrIv) },
    windowRafInterval_ms: { ...describe(winIv), ...countOver(winIv) },
    xrCallbackJs_ms: describe(sl(rec.jsMs)),
    renderSubmit_ms: describe(sl(rec.renderMs)),
    appUpdateJs_ms: describe(sl(rec.jsMs).map((v, i) => Math.max(0, v - sl(rec.renderMs)[i]))),
    jsHeap: { allocatedKBPerSec: Number((rec.heapAllocBytes / 1024 / (rec.wallMs / 1000)).toFixed(1)), gcDropsObserved: rec.gcDrops },
    gpuTime_ms: rec.gpuMs.length ? describe(rec.gpuMs) : null,
    perXrFrame: {
      glDrawCommands: med(sl(rec.glDraws)),
      glTriangles: med(sl(rec.glTris)),
      rendererRenderInvocations: med(sl(rec.renders)),
      rendererInfoCalls: med(sl(rec.infoCalls)),
      rendererInfoTriangles: med(sl(rec.infoTris)),
    },
  };
}

