# Starts the Hermes API and web console as detached processes.
#
#   start.bat
#   powershell -ExecutionPolicy Bypass -File scripts\start_stack.ps1
#
# Logs and pid files live in <repo>\logs. Stop everything with stop.bat.

param(
    [int]$ApiPort = 8200,
    [int]$WebPort = 5273
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logs | Out-Null

function Test-Port([int]$port) {
    return [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

function Wait-Http([string]$url, [int]$seconds = 90) {
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) { return $true }
        } catch {
            Start-Sleep -Milliseconds 750
        }
    }
    return $false
}

function Start-Detached([string]$workdir, [string]$command, [string]$name) {
    $line = "cmd.exe /c cd /d `"$workdir`" && $command > `"$logs\$name.log`" 2> `"$logs\$name.err`""
    $created = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $line }
    if ($created.ReturnValue -ne 0) {
        throw "Could not start $name (Win32_Process.Create returned $($created.ReturnValue))."
    }
    $created.ProcessId | Set-Content (Join-Path $logs "$name.pid")
}

# --- API ------------------------------------------------------------------
if (-not (Test-Port $ApiPort)) {
    $python = Join-Path $root "backend\.venv\Scripts\python.exe"
    if (-not (Test-Path $python)) {
        throw "Python venv missing at $python. Run: cd backend; uv sync --group dev"
    }
    Write-Host "Starting API on port $ApiPort ..."
    Start-Detached (Join-Path $root "backend") `
        "`"$python`" -m uvicorn app.main:app --host 127.0.0.1 --port $ApiPort" "api"
} else {
    Write-Host "API already listening on $ApiPort."
}

# --- web ------------------------------------------------------------------
if (-not (Test-Port $WebPort)) {
    if (-not (Test-Path (Join-Path $root "frontend\node_modules"))) {
        throw "Frontend dependencies missing. Run: cd frontend; npm install"
    }
    Write-Host "Starting web console on port $WebPort ..."
    Start-Detached (Join-Path $root "frontend") `
        "npx --no-install vite --host 127.0.0.1 --port $WebPort --strictPort" "web"
} else {
    Write-Host "Web already listening on $WebPort."
}

# --- readiness ------------------------------------------------------------
$apiReady = Wait-Http "http://127.0.0.1:$ApiPort/api/v1/system/status" 120
$webReady = Wait-Http "http://127.0.0.1:$WebPort/" 120

# The launcher can exit after spawning the real process; record the listener.
foreach ($pair in @(@("api", $ApiPort), @("web", $WebPort))) {
    $name, $port = $pair
    $connection = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($connection) { $connection.OwningProcess | Set-Content (Join-Path $logs "$name.pid") }
}

Write-Host ""
if ($apiReady) { Write-Host "API   ready  -> http://127.0.0.1:$ApiPort/api/docs" }
else { Write-Host "API   NOT ready - see logs\api.err" -ForegroundColor Yellow }

if ($webReady) { Write-Host "Console ready -> http://127.0.0.1:$WebPort" }
else { Write-Host "Console NOT ready - see logs\web.err" -ForegroundColor Yellow }

Write-Host ""
Write-Host "Logs: $logs"
Write-Host "Stop with stop.bat"
