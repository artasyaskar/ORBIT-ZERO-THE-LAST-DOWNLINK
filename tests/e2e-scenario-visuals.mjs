// Scenario authenticity + camera-clearance check for every operation, desktop build, no emulator.
//
// For each operation it verifies, from live scene objects (not screenshots):
//  1. the operation loads (state.scenarioId matches);
//  2. its hazard visuals exist: merged hazard mesh has geometry, the globe surface has an emissive hazard map,
//     and the weather/disaster sprite layer is visible;
//  3. no wording from another hazard leaks into the briefing / next-step text (earthquake op must not say flood...);
//  4. the orbiting CubeSat, sampled over a full orbit from the DESIGN EYE, never blocks the globe and never
//     comes closer to the head than MIN_EYE_DISTANCE_M, and stays above the desk.
// Usage: npm run build ; node tests/e2e-scenario-visuals.mjs   (prints the measured numbers either way)
import { launchApp } from './_harness.mjs';

const DESIGN_EYE = { x: 0, y: 1.25, z: 0.1 };
const MIN_EYE_DISTANCE_M = 0.35;
const MAX_GLOBE_OCCLUSION = 0.0; // fraction of frames the satellite may sit between the eye and the globe disc
const MIN_SAT_Y = 0.95;

const OPERATIONS = [
  { id: 'FIRELINE_PASS', theme: 'WILDFIRE', forbid: /flood|levee|monsoon|earthquake|aftershock|seismic/i },
  { id: 'STANDARD_INDUS_PASS', theme: 'FLOOD', forbid: /wildfire|smoke|earthquake|aftershock|seismic|fault/i },
  { id: 'MONSOON_SUPERCELL_PASS', theme: 'FLOOD', forbid: /wildfire|smoke|earthquake|aftershock|seismic|fault/i },
  { id: 'SOLAR_BROWNOUT_PASS', theme: 'FLOOD', forbid: /wildfire|smoke|earthquake|aftershock|seismic|fault/i },
  { id: 'AFTERSHOCK_PASS', theme: 'EARTHQUAKE', forbid: /flood|levee|indus|monsoon|wildfire|smoke/i },
];

const { url, page, failures, close } = await launchApp({ iwer: false, skipLanding: true });
const log = (...a) => console.log('[scenario-visuals]', ...a);
let ok = true;
const check = (cond, msg) => { log(cond ? 'PASS' : 'FAIL', msg); if (!cond) ok = false; };

try {
  for (const op of OPERATIONS) {
    log(`--- ${op.id} (${op.theme}) ---`);
    await page.goto(`${url}?game&scenario=${op.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__ORBIT_ZERO__?.getState?.()), null, { timeout: 90000 });
    await page.waitForTimeout(2500);

    const state = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
    check(state.scenarioId === op.id, `${op.id}: loaded (state.scenarioId=${state.scenarioId})`);

    const visuals = await page.evaluate(() => {
      const api = window.__ORBIT_ZERO__;
      const globe = api.getSceneObject('earth-globe');
      const hazard = globe?.getObjectByName('MergedStormFloodLightning');
      const core = globe?.getObjectByName('GlobeCoreSphere');
      const weather = globe?.getObjectByName('SectorWeatherFx');
      const cubesat = api.getSceneObject('cubesat-spacecraft');
      let cubesatPickable = false;
      cubesat?.traverse((c) => { if (c.isMesh && c.raycast.toString().replace(/\s/g, '') !== '()=>{}') cubesatPickable = true; });
      return {
        hazardVerts: hazard?.geometry?.getAttribute('position')?.count ?? 0,
        hazardHasTimeUniform: Boolean(hazard?.material?.uniforms?.uTime),
        emissiveMap: Boolean(core?.material?.emissiveMap),
        weatherVisible: Boolean(weather?.visible),
        cubesatPickable,
      };
    });
    check(visuals.hazardVerts > 30, `${op.id}: hazard mesh has geometry (${visuals.hazardVerts} vertices)`);
    check(visuals.hazardHasTimeUniform, `${op.id}: hazard shader is animated (uTime uniform)`);
    check(visuals.emissiveMap, `${op.id}: globe surface carries the hazard emissive map`);
    check(visuals.weatherVisible, `${op.id}: weather / disaster sprites visible`);
    check(!visuals.cubesatPickable, `${op.id}: CubeSat cannot steal sector clicks (raycast disabled)`);

    const text = await page.evaluate(() => {
      const modal = document.querySelector('#orbit-zero-briefing-modal');
      const tableText = modal?.querySelector('table')?.textContent ?? '';
      const headerParagraph = modal?.querySelector('p')?.textContent ?? '';
      const bannerText = document.querySelector('#orbit-zero-hud-banner')?.textContent ?? '';
      return `${headerParagraph} ${tableText} ${bannerText}`;
    });
    const leak = op.forbid.exec(text);
    check(!leak, `${op.id}: no wording from another hazard in the briefing/next-step text${leak ? ` (found "${leak[0]}")` : ''}`);

    // One full orbit is 2*pi/0.56 = 11.2 s; sample 14 s at animation-frame rate.
    const orbit = await page.evaluate(async (eye) => {
      const api = window.__ORBIT_ZERO__;
      const globe = api.getSceneObject('earth-globe');
      const sat = api.getSceneObject('cubesat-spacecraft');
      const THREE_Vec = sat.position.constructor;
      const gc = globe.getWorldPosition(new THREE_Vec());
      const globeR = 0.195 * globe.scale.x;
      let minEye = Infinity; let minY = Infinity; let samples = 0; let occluding = 0; let maxSpan = 0;
      const e = new THREE_Vec(eye.x, eye.y, eye.z);
      const t0 = performance.now();
      await new Promise((resolve) => {
        const tick = () => {
          sat.updateWorldMatrix(true, true);
          const p = sat.getWorldPosition(new THREE_Vec());
          // Visible size of the craft: half of its largest bounding-box dimension.
          let radius = 0.16 * sat.scale.x / 0.62;
          const d = p.distanceTo(e);
          const dGlobe = gc.distanceTo(e);
          const toSat = p.clone().sub(e).normalize();
          const toGlobe = gc.clone().sub(e).normalize();
          const sep = Math.acos(Math.min(1, Math.max(-1, toSat.dot(toGlobe))));
          const angSat = Math.asin(Math.min(1, radius / d));
          const angGlobe = Math.asin(Math.min(1, globeR / dGlobe));
          if (d < dGlobe && sep < angGlobe + angSat * 0.5) occluding += 1;
          minEye = Math.min(minEye, d); minY = Math.min(minY, p.y); samples += 1;
          maxSpan = Math.max(maxSpan, angSat);
          if (performance.now() - t0 < 14000) requestAnimationFrame(tick); else resolve();
        };
        requestAnimationFrame(tick);
      });
      return { minEye, minY, samples, occludingFraction: occluding / samples, maxHalfAngleDeg: (maxSpan * 180) / Math.PI };
    }, DESIGN_EYE);
    log(`${op.id}: sampled ${orbit.samples} frames | min eye distance ${orbit.minEye.toFixed(3)} m | min y ${orbit.minY.toFixed(3)} m | globe-occluding ${(orbit.occludingFraction * 100).toFixed(1)}% | max craft half-angle ${orbit.maxHalfAngleDeg.toFixed(1)} deg`);
    check(orbit.samples > 200, `${op.id}: orbit sampled for enough frames`);
    check(orbit.minEye >= MIN_EYE_DISTANCE_M, `${op.id}: CubeSat stays >= ${MIN_EYE_DISTANCE_M} m from the head`);
    check(orbit.occludingFraction <= MAX_GLOBE_OCCLUSION, `${op.id}: CubeSat never blocks the globe`);
    check(orbit.minY >= MIN_SAT_Y, `${op.id}: CubeSat stays above the desk (y >= ${MIN_SAT_Y})`);
  }
  check(failures.length === 0, `no console/page errors (${failures.slice(0, 3).join(' | ')})`);
} catch (err) {
  ok = false;
  log('ERROR', err?.stack ?? err);
} finally {
  await close();
}
log(ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
