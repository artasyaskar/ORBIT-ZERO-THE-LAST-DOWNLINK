// Pixel diff of two same-size screenshots (P1 visual checks after render optimizations).
// Prints the share of pixels whose largest channel difference exceeds a threshold and writes a diff image
// (changed pixels in magenta over a dimmed copy of the first image).
//
// Usage: node tests/image-diff.mjs before.png after.png diff-out.png [threshold=24]
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const [aPath, bPath, outPath, thresholdArg] = process.argv.slice(2);
if (!aPath || !bPath || !outPath) {
  console.error('usage: node tests/image-diff.mjs before.png after.png diff-out.png [threshold]');
  process.exit(2);
}
const threshold = Number(thresholdArg ?? 24);
const toDataUrl = async (p) => `data:image/png;base64,${(await readFile(p)).toString('base64')}`;
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'chrome' : 'chromium', headless: true });
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async ({ a, b, threshold }) => {
    const load = (src) => new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { error: `size mismatch ${ia.width}x${ia.height} vs ${ib.width}x${ib.height}` };
    const w = ia.width;
    const h = ia.height;
    const pixels = (img) => { const c = new OffscreenCanvas(w, h); const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h); };
    const da = pixels(ia);
    const db = pixels(ib);
    const out = new ImageData(w, h);
    let changed = 0;
    let sum = 0;
    for (let i = 0; i < da.data.length; i += 4) {
      const d = Math.max(Math.abs(da.data[i] - db.data[i]), Math.abs(da.data[i + 1] - db.data[i + 1]), Math.abs(da.data[i + 2] - db.data[i + 2]));
      sum += d;
      if (d > threshold) {
        changed++;
        out.data[i] = 255; out.data[i + 1] = 0; out.data[i + 2] = 255; out.data[i + 3] = 255;
      } else {
        out.data[i] = da.data[i] * 0.35; out.data[i + 1] = da.data[i + 1] * 0.35; out.data[i + 2] = da.data[i + 2] * 0.35; out.data[i + 3] = 255;
      }
    }
    const c = new OffscreenCanvas(w, h);
    c.getContext('2d').putImageData(out, 0, 0);
    const blob = await c.convertToBlob({ type: 'image/png' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { width: w, height: h, changedPct: (changed / (w * h)) * 100, meanDiff: sum / (w * h), png: btoa(bin) };
  }, { a: await toDataUrl(aPath), b: await toDataUrl(bPath), threshold });
  if (result.error) {
    console.log(JSON.stringify({ error: result.error }));
    process.exitCode = 1;
  } else {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(outPath, Buffer.from(result.png, 'base64'));
    console.log(JSON.stringify({ changedPct: Number(result.changedPct.toFixed(3)), meanDiff: Number(result.meanDiff.toFixed(3)), threshold, diff: outPath }));
  }
} finally {
  await browser.close();
}
