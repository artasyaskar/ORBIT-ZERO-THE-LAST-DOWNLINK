import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchApp, root, playFirelineOptimal } from './_harness.mjs';

const app = await launchApp({ skipLanding: true });
const { page } = app;
await page.goto(app.url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ORBIT_ZERO__), null, { timeout: 60000 });
await page.waitForTimeout(1000);
await page.evaluate(() => window.__ORBIT_ZERO__.setScenario('FIRELINE_PASS'));
await playFirelineOptimal(page);
await page.waitForTimeout(800);
const res = { desktopActive: await page.evaluate(() => window.__ORBIT_ZERO__.getTopContributors(18)) };
await page.evaluate(() => window.__ORBIT_ZERO__.clickPanel('briefing-panel', 'xr-button'));
await page.waitForFunction(() => window.__ORBIT_ZERO__.getRuntimeStatus().immersive, null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1000);
res.xrActive = await page.evaluate(() => window.__ORBIT_ZERO__.getTopContributors(18));
await writeFile(join(root, 'artifacts', 'profile', 'contributors.json'), JSON.stringify(res, null, 2));
for (const k of Object.keys(res)) {
  console.log('==', k);
  for (const r of res[k]) console.log(String(r.tris).padStart(7), String(r.calls).padStart(4), r.name);
}
await app.close();

