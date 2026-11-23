@echo off
rem ---------------------------------------------------------------------------
rem  Starts the FastAPI backend (port 8000) and the Vite frontend (port 5173)
rem  together in this one terminal. Press Ctrl+C once to stop both.
rem
rem  The real work is done by the PowerShell block at the bottom of this file,
rem  because plain cmd cannot reliably stop a background process on Ctrl+C.
rem ---------------------------------------------------------------------------
setlocal
set "APP_ROOT=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s = Get-Content -Raw -LiteralPath '%~f0'; Invoke-Expression $s.Substring($s.IndexOf('#PS' + '_BEGIN'))"
exit /b %errorlevel%

#PS_BEGIN
$ErrorActionPreference = 'Stop'
$root     = $env:APP_ROOT.TrimEnd('\')
$backend  = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'

# Prefer a virtual environment if one exists, otherwise the python on PATH.
$py = 'python'
foreach ($candidate in @(
    (Join-Path $backend 'venv\Scripts\python.exe'),
    (Join-Path $backend '.venv\Scripts\python.exe'),
    (Join-Path $root    'venv\Scripts\python.exe'),
    (Join-Path $root    '.venv\Scripts\python.exe'))) {
    if (Test-Path $candidate) { $py = $candidate; break }
}
if ($py -eq 'python' -and -not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host 'Python not found. Install Python 3.10+ or create backend\venv.' -ForegroundColor Red
    exit 1
}
try { & $py -c "import uvicorn" 2>$null; $hasDeps = ($LASTEXITCODE -eq 0) } catch { $hasDeps = $false }
if (-not $hasDeps) {
    Write-Host "Backend dependencies missing for $py." -ForegroundColor Red
    Write-Host 'Run:  cd backend; python -m venv venv; venv\Scripts\pip install -r requirements.txt' -ForegroundColor Yellow
    exit 1
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    Write-Host 'npm not found. Install Node.js first.' -ForegroundColor Red
    exit 1
}

# First run: install frontend dependencies.
if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
    Write-Host 'Installing frontend dependencies...' -ForegroundColor Yellow
    Push-Location $frontend
    try { & npm.cmd install; if ($LASTEXITCODE) { exit $LASTEXITCODE } } finally { Pop-Location }
}

Write-Host "Backend : http://localhost:8000  (python: $py)" -ForegroundColor Cyan
Write-Host 'Frontend: http://localhost:5173' -ForegroundColor Cyan
Write-Host 'Press Ctrl+C to stop both.' -ForegroundColor Cyan
Write-Host ''

$backendProc = Start-Process -FilePath $py `
    -ArgumentList '-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8000', '--reload' `
    -WorkingDirectory $backend -NoNewWindow -PassThru

try {
    Push-Location $frontend
    & npm.cmd run dev
}
finally {
    Pop-Location
    # Kill uvicorn and its reloader/worker children if they are still running.
    if (-not $backendProc.HasExited) {
        & taskkill.exe /F /T /PID $backendProc.Id 2>&1 | Out-Null
    }
    Write-Host 'Stopped backend and frontend.' -ForegroundColor Cyan
}
