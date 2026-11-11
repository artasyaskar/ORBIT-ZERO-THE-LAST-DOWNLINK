#!/usr/bin/env node
/**
 * ORBIT ZERO: THE LAST DOWNLINK — Reliable Dev Server Launcher
 *
 * Why this exists:
 * `iwsdk dev restart --open --foreground` wraps `vite` in a 60,000 ms polling loop that
 * contends on `.iwsdk/runtime/session.json.lock` on Windows (spawning synchronous
 * `powershell.exe` process-start queries) and times out with `dev_up_timeout` on cold
 * caches, or opens the IWSDK Scene Editor shell (`/__iwsdk/workspace`) instead of the game.
 *
 * Running Vite directly via `createServer()` still runs `iwsdkDev()` from `vite.config.ts`:
 * - Generates the local HTTPS certificate (`.iwsdk/https/_cert.pem`) required by WebXR
 * - Injects the 1.15 MB IWER Meta Quest 3 WebXR runtime (`window.IWER_DEVICE`)
 * - Registers `.iwsdk/runtime/session.json` so `npm run dev:status` works
 * - Opens `https://localhost:8081/` directly to the ORBIT ZERO Landing Page -> VR / Desktop selector
 */

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

const root = resolve(process.cwd());
const args = new Set(process.argv.slice(2));
const shouldOpen = !args.has('--no-open') && !process.env.CI;

// Keep iwsdkDev()'s IWER runtime injection + HTTPS + session registration active,
// but disable its Scene Editor workspace browser takeover so `/` serves index.html (Landing Page).
if (process.env.IWSDK_DEV_OPEN === undefined) {
  process.env.IWSDK_DEV_OPEN = 'false';
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

function cleanStaleRuntimeState() {
  const runtimeDir = join(root, '.iwsdk', 'runtime');
  if (!existsSync(runtimeDir)) return;
  try {
    for (const entry of readdirSync(runtimeDir)) {
      if (entry.includes('.lock') || entry.endsWith('.tmp')) {
        rmSync(join(runtimeDir, entry), { recursive: true, force: true });
      }
    }
    for (const file of ['owner.json', 'session.json', 'launch.json']) {
      const filePath = join(runtimeDir, file);
      if (!existsSync(filePath)) continue;
      try {
        const data = JSON.parse(readFileSync(filePath, 'utf8'));
        if (data?.pid && !isPidAlive(data.pid)) {
          rmSync(filePath, { force: true });
        }
      } catch {
        rmSync(filePath, { force: true });
      }
    }
  } catch {
    // Best-effort cleanup of orphaned lockfiles
  }
}

/**
 * IWSDK's runtime owner check synchronously runs powershell.exe with a 1500 ms timeout.
 * Pre-warming PowerShell CLR assemblies in OS cache prevents cold-start timeouts on Windows.
 */
function warmWindowsPowerShell() {
  if (process.platform !== 'win32') return Promise.resolve();
  return new Promise((res) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', '(Get-Process -Id $PID).Id'],
      { stdio: 'ignore', windowsHide: true },
    );
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      res();
    }, 6000);
    child.once('exit', () => {
      clearTimeout(timer);
      res();
    });
    child.once('error', () => {
      clearTimeout(timer);
      res();
    });
  });
}

function openBrowserUrl(url) {
  try {
    if (process.platform === 'win32') {
      const child = spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
    } else if (process.platform === 'darwin') {
      const child = spawn('open', [url], { detached: true, stdio: 'ignore' });
      child.unref();
    } else {
      const child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
      child.unref();
    }
  } catch {
    // Ignore browser auto-open errors; URL is printed to terminal
  }
}

async function startWithOwnerRetry(maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    cleanStaleRuntimeState();
    await warmWindowsPowerShell();
    let server;
    try {
      server = await createServer({
        root,
        configFile: resolve(root, 'vite.config.ts'),
      });
      await server.listen();
      return server;
    } catch (err) {
      await server?.close().catch(() => {});
      const retryable = err?.code === 'runtime_owner_identity_unavailable' && attempt < maxAttempts;
      if (!retryable) throw err;
      console.warn(`\n⚠️  [ORBIT ZERO] Windows PowerShell ownership check timed out (attempt ${attempt}/${maxAttempts}); retrying...`);
      await new Promise((res) => setTimeout(res, 500));
    }
  }
  throw new Error('Failed to start Vite dev server after retries.');
}

async function main() {
  const t0 = Date.now();
  console.log('\n🛰️  ORBIT ZERO: Starting HTTPS WebXR Dev Server (first cold start may take 15-30s)...');

  const server = await startWithOwnerRetry();

  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✅ ORBIT ZERO Dev Server ready in ${elapsedSec}s:`);
  server.printUrls();
  console.log('  ➜  Flow:     Landing Page -> Select Operation -> PLAY ON DESKTOP or ENTER VR');
  console.log('  ➜  Quest 3:  Open the Network https:// URL above in Meta Quest Browser (same Wi-Fi)\n');

  server.bindCLIShortcuts({ print: true });

  const localUrl = server.resolvedUrls?.local?.[0] ?? 'https://localhost:8081/';
  if (shouldOpen) {
    openBrowserUrl(localUrl);
  }
}

main().catch((err) => {
  console.error('\n❌ [ORBIT ZERO] Failed to start dev server:', err);
  if (err?.code === 'runtime_owner_identity_unavailable') {
    console.error('\n💡 Workaround if PowerShell is throttled on battery: run `npm run build` then `npx vite preview --port 8081 --host`.');
  }
  process.exit(1);
});

