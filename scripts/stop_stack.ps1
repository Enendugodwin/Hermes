# Stops the Hermes API and web console started by start_stack.ps1.
#
#   stop.bat
#   stop.bat -StopDatabase     (also stops a local PostgreSQL cluster, if present)
#
# The default local setup uses SQLite, so PostgreSQL is left alone unless asked.

param(
    [int]$ApiPort = 8200,
    [int]$WebPort = 5273,
    [int]$DbPort = 5433,
    [switch]$StopDatabase
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $root "logs"

function Stop-ByPort([int]$port, [string]$label) {
    $connections = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if (-not $connections) {
        Write-Host "$label is not running."
        return
    }
    $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $pids) {
        & taskkill.exe /PID $processId /T /F *> $null
        Write-Host "$label stopped (port $port, pid $processId)."
    }
}

Stop-ByPort $WebPort "Web"
Stop-ByPort $ApiPort "API"

Remove-Item (Join-Path $logs "web.pid") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $logs "api.pid") -Force -ErrorAction SilentlyContinue

if ($StopDatabase) {
    $pgHome = Join-Path $env:USERPROFILE "pgsql\pgsql"
    $dataDir = Join-Path $env:USERPROFILE "pgsql\data"
    if (Test-Path (Join-Path $pgHome "bin\pg_ctl.exe")) {
        & (Join-Path $pgHome "bin\pg_ctl.exe") -D $dataDir -m fast stop *> $null
        Write-Host "PostgreSQL stopped."
    } else {
        Write-Host "PostgreSQL binaries not found; nothing to stop."
    }
} else {
    Write-Host "Database left running (SQLite/local)."
}
