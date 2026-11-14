# Start ASTRA (backend + built frontend) on one port.
# Usage:   powershell -ExecutionPolicy Bypass -File scripts\start.ps1 [-Port 8000] [-LocalOnly]
#
# By default the server listens on all network interfaces so phones on the same
# Wi-Fi can open QR viewer links. Windows may ask once to allow Python through
# the firewall: allow it on private networks. Use -LocalOnly to listen on
# 127.0.0.1 only (QR links will then work on this computer only).
param(
    [int]$Port = 8000,
    [switch]$LocalOnly
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $root "backend\.venv\Scripts\python.exe"
$dist = Join-Path $root "frontend\dist\index.html"

if (-not (Test-Path $venvPython) -or -not (Test-Path $dist)) {
    Write-Host "First run: installing dependencies and building the UI..." -ForegroundColor Yellow
    & (Join-Path $PSScriptRoot "setup.ps1")
}

$bindHost = "0.0.0.0"
if ($LocalOnly) { $bindHost = "127.0.0.1" }

Write-Host ""
Write-Host "ASTRA is starting on http://localhost:$Port" -ForegroundColor Green
Write-Host "Demo accounts are listed in README.md. Press Ctrl+C to stop."
Write-Host ""

Push-Location (Join-Path $root "backend")
try {
    & $venvPython -m uvicorn app.main:app --host $bindHost --port $Port
} finally {
    Pop-Location
}
