# One-time setup: Python virtual environment, backend dependencies, frontend build.
# Usage (from the repo root):   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "== ASTRA setup ==" -ForegroundColor Cyan

$venvPython = Join-Path $root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "Creating Python virtual environment (backend\.venv)..."
    python -m venv (Join-Path $root "backend\.venv")
    if ($LASTEXITCODE -ne 0) { throw "Could not create the virtual environment. Is Python 3.11+ installed?" }
}
Write-Host "Installing backend dependencies..."
& $venvPython -m pip install --quiet --upgrade pip
& $venvPython -m pip install --quiet -r (Join-Path $root "backend\requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "pip install failed" }

Write-Host "Installing frontend dependencies and building the UI..."
Push-Location (Join-Path $root "frontend")
try {
    npm install --no-fund --no-audit
    if ($LASTEXITCODE -ne 0) { throw "npm install failed. Is Node.js 20+ installed?" }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "frontend build failed" }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Setup complete. Start ASTRA with:  scripts\start.ps1" -ForegroundColor Green
