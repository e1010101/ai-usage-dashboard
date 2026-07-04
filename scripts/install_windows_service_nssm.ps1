#requires -Version 5.1

[CmdletBinding()]
param(
    [string]$ServiceName = "ai-usage-dashboard",
    [string]$DisplayName = "AI Usage Dashboard",
    [string]$RepoDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$UserHome = $env:USERPROFILE,
    [int]$Port = 8765,
    [switch]$NoStart,
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-NssmPath {
    $command = Get-Command nssm -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "nssm.exe was not found on PATH. Install NSSM first, then rerun this script from an elevated PowerShell."
    }
    return $command.Source
}

function Join-WindowsArgumentList {
    param([string[]]$Items)

    ($Items | ForEach-Object {
        $value = [string]$_
        if ($value -eq "") {
            '""'
        } elseif ($value -match '[\s"]') {
            '"' + ($value -replace '\\', '\\' -replace '"', '\"') + '"'
        } else {
            $value
        }
    }) -join " "
}

function Stop-ManualDashboardProcesses {
    param([string]$CommandNeedle)

    $matches = Get-CimInstance Win32_Process |
        Where-Object { $_.CommandLine -and $_.CommandLine.Contains($CommandNeedle) } |
        Sort-Object ParentProcessId -Descending

    foreach ($process in $matches) {
        Write-Host "Stopping existing dashboard process $($process.ProcessId)"
        Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Assert-Admin {
    if (-not (Test-IsAdministrator)) {
        throw "This script must be run from an elevated PowerShell because Windows service creation requires administrator rights."
    }
}

Assert-Admin

$nssm = Get-NssmPath
$repo = (Resolve-Path $RepoDir).Path
$python = Join-Path $repo ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $python)) {
    throw "Expected Python virtualenv at $python. Create/install the repo .venv before installing the service."
}

$dataDir = Join-Path $UserHome ".codex-usage-tracker"
$logsDir = Join-Path $dataDir "logs"
New-Item -ItemType Directory -Force -Path $dataDir, $logsDir | Out-Null

if ($Uninstall) {
    Write-Host "Stopping $ServiceName if it is running..."
    & $nssm stop $ServiceName 2>$null
    Write-Host "Removing $ServiceName..."
    & $nssm remove $ServiceName confirm
    return
}

$service = Get-CimInstance Win32_Service -Filter "Name='$ServiceName'" -ErrorAction SilentlyContinue
if (-not $service) {
    Write-Host "Installing $ServiceName with NSSM..."
    & $nssm install $ServiceName $python
} else {
    Write-Host "Updating existing $ServiceName service..."
    & $nssm stop $ServiceName 2>$null
    & $nssm set $ServiceName Application $python
}

$arguments = @(
    "-m", "codex_usage_tracker",
    "--db", (Join-Path $dataDir "usage.sqlite3"),
    "--pricing", (Join-Path $dataDir "pricing.json"),
    "--allowance", (Join-Path $dataDir "allowance.json"),
    "--rate-card", (Join-Path $dataDir "rate-card.json"),
    "--claude-limits", (Join-Path $dataDir "claude-limits.json"),
    "--thresholds", (Join-Path $dataDir "thresholds.json"),
    "--projects", (Join-Path $dataDir "projects.json"),
    "serve-dashboard",
    "--output", (Join-Path $dataDir "dashboard.html"),
    "--host", "127.0.0.1",
    "--port", [string]$Port,
    "--context-api", "explicit",
    "--refresh",
    "--source", "all",
    "--codex-home", (Join-Path $UserHome ".codex"),
    "--claude-home", (Join-Path $UserHome ".claude")
)

$appParameters = Join-WindowsArgumentList $arguments
$stdout = Join-Path $logsDir "dashboard-service.out.log"
$stderr = Join-Path $logsDir "dashboard-service.err.log"

& $nssm set $ServiceName AppDirectory $repo
& $nssm set $ServiceName AppParameters $appParameters
& $nssm set $ServiceName DisplayName $DisplayName
& $nssm set $ServiceName Description "Serves the local AI Usage Dashboard on 127.0.0.1:$Port."
& $nssm set $ServiceName Start SERVICE_AUTO_START
& $nssm set $ServiceName AppEnvironmentExtra PYTHONUNBUFFERED=1
& $nssm set $ServiceName AppStdout $stdout
& $nssm set $ServiceName AppStderr $stderr
& $nssm set $ServiceName AppRotateFiles 1
& $nssm set $ServiceName AppRotateOnline 1
& $nssm set $ServiceName AppRotateBytes 10485760

Stop-ManualDashboardProcesses "codex_usage_tracker serve-dashboard"

if (-not $NoStart) {
    Write-Host "Starting $ServiceName..."
    & $nssm start $ServiceName

    $url = "http://127.0.0.1:$Port/"
    $deadline = (Get-Date).AddSeconds(60)
    do {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 3
            if ($response.StatusCode -eq 200) {
                Write-Host "Dashboard service is reachable at $url"
                return
            }
        } catch {
            Start-Sleep -Seconds 1
        }
    } while ((Get-Date) -lt $deadline)

    throw "Service was started, but $url did not return HTTP 200 within 60 seconds. Check $stderr and $stdout."
}

Write-Host "Installed $ServiceName. Start it with: nssm start $ServiceName"
