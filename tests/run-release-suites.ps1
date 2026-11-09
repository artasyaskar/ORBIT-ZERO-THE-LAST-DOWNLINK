# Runs every release suite against the current dist/ build, one at a time (they share the machine; parallel
# runs time out on the 8 GB dev laptop). Usage: npm run build ; powershell -File tests/run-release-suites.ps1
# Writes one log per suite to $env:TEMP\oz-suite-<name>.log and a summary line per suite; exit code 1 if any fail.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$suites = @(
  @{ name = 'headset'; cmd = 'node tests/virtual-headset-player.mjs' },
  @{ name = 'hands-first'; cmd = 'node tests/e2e-hands-first-proof.mjs' },
  @{ name = 'enter-vr'; cmd = 'node tests/e2e-enter-vr.mjs' },
  @{ name = 'desktop'; cmd = 'node tests/e2e-redesign-desktop.mjs' },
  @{ name = 'hands-only'; cmd = 'node tests/e2e-hands-only.mjs'; env = @{ ORBIT_SKIP_BUILD = '1' } },
  @{ name = 'perf-hud'; cmd = 'node tests/e2e-perf-hud.mjs'; env = @{ ORBIT_PERF_SUMMARY = '0' } },
  @{ name = 'deploy'; cmd = 'node tests/deploy-static-check.mjs' }
)
$failed = 0
foreach ($s in $suites) {
  $log = Join-Path $env:TEMP "oz-suite-$($s.name).log"
  if ($s.env) { foreach ($k in $s.env.Keys) { Set-Item -Path "Env:$k" -Value $s.env[$k] } }
  $t0 = Get-Date
  cmd /c "$($s.cmd) > `"$log`" 2>&1"
  $code = $LASTEXITCODE
  if ($s.env) { foreach ($k in $s.env.Keys) { Remove-Item -Path "Env:$k" -ErrorAction SilentlyContinue } }
  $secs = [int]((Get-Date) - $t0).TotalSeconds
  $verdict = if ($code -eq 0) { 'PASS' } else { 'FAIL'; $failed++ }
  $tail = (Get-Content $log -Tail 1)
  Write-Output ("{0,-12} {1} exit={2} {3}s | {4}" -f $s.name, $verdict, $code, $secs, $tail)
}
Write-Output "suites failed: $failed"
exit ([int]($failed -gt 0))
