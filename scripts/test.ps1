# Run the automated checks.
# Usage:   powershell -ExecutionPolicy Bypass -File scripts\test.ps1 [-E2E]
#
#   backend   pytest: engine determinism, layer separation, RBAC, API + WebSocket flows
#   frontend  TypeScript type-check
#   -E2E      also drive the real UI in Chrome/Edge (requires ASTRA to be running:
#             scripts\start.ps1 in another terminal)
param([switch]$E2E)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$failed = $false

Write-Host "== Backend tests ==" -ForegroundColor Cyan
Push-Location (Join-Path $root "backend")
try {
    & ".venv\Scripts\python.exe" -m pytest tests -q
    if ($LASTEXITCODE -ne 0) { $failed = $true }
} finally { Pop-Location }

Write-Host "== Frontend type-check ==" -ForegroundColor Cyan
Push-Location (Join-Path $root "frontend")
try {
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { $failed = $true }
    if ($E2E) {
        Write-Host "== Browser end-to-end test ==" -ForegroundColor Cyan
        node e2e/smoke.mjs
        if ($LASTEXITCODE -ne 0) { $failed = $true }
    }
} finally { Pop-Location }

if ($failed) { Write-Host "Some checks FAILED." -ForegroundColor Red; exit 1 }
Write-Host "All checks passed." -ForegroundColor Green
