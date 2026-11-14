# Development mode: auto-reloading backend (port 8000) + Vite dev server (port 5173).
# Usage:   powershell -ExecutionPolicy Bypass -File scripts\dev.ps1
# Open http://localhost:5173 - Vite proxies /api, the WebSocket and /terrain to the backend.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) { & (Join-Path $PSScriptRoot "setup.ps1") }

$backend = Start-Process -PassThru -WorkingDirectory (Join-Path $root "backend") -FilePath $venvPython `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"
Write-Host "Backend started (PID $($backend.Id)) on http://localhost:8000" -ForegroundColor Green

Push-Location (Join-Path $root "frontend")
try {
    npm run dev
} finally {
    Pop-Location
    if (-not $backend.HasExited) { Stop-Process -Id $backend.Id -Force }
}
