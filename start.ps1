$ErrorActionPreference = 'Stop'
$frontendDir = Join-Path $PSScriptRoot 'frontend'
$serverUrl = 'http://localhost:5173/'
$tempProfile = Join-Path $env:TEMP 'signbridge-browser-profile'

function Find-Browser {
    $pf86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
    $pf = $env:ProgramFiles
    $candidates = @(
        (Join-Path $pf86 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $pf 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $pf86 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $pf 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LocalAppData 'Google\Chrome\Application\chrome.exe')
    )
    foreach ($p in $candidates) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

function Stop-ProcessTree([int]$processId) {
    & taskkill /T /F /PID $processId 2>$null
}

Write-Host 'Checking frontend directory...'
if (-not (Test-Path (Join-Path $frontendDir 'package.json'))) {
    Write-Host 'Error: frontend/package.json not found' -ForegroundColor Red
    Read-Host 'Press Enter to exit'
    exit 1
}

Write-Host 'Finding browser...'
$browserPath = Find-Browser
if (-not $browserPath) {
    Write-Host 'Error: Chrome or Edge browser not found' -ForegroundColor Red
    Read-Host 'Press Enter to exit'
    exit 1
}
$browserName = [System.IO.Path]::GetFileNameWithoutExtension($browserPath)

Write-Host "Browser found: $browserName"
Write-Host "Path: $browserPath"

Write-Host ''
Write-Host '================================================' -ForegroundColor Cyan
Write-Host '           SignBridge One-Click Start           ' -ForegroundColor Cyan
Write-Host '================================================' -ForegroundColor Cyan
Write-Host ''
Write-Host "  Browser: $browserName (isolated instance)" -ForegroundColor Gray
Write-Host "  Server: $serverUrl" -ForegroundColor Gray
Write-Host ''

if (-not (Test-Path (Join-Path $frontendDir 'node_modules'))) {
    Write-Host 'node_modules not found, installing dependencies...' -ForegroundColor Yellow
    Push-Location $frontendDir
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Dependency installation failed, please run npm install manually' -ForegroundColor Red
        Pop-Location
        Read-Host 'Press Enter to exit'
        exit 1
    }
    Pop-Location
    Write-Host 'Dependencies installed' -ForegroundColor Green
    Write-Host ''
}

if (Test-Path $tempProfile) {
    Remove-Item $tempProfile -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host 'Starting development server...' -ForegroundColor Yellow
$serverProcess = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm run dev' -WorkingDirectory $frontendDir -PassThru -WindowStyle Minimized

Write-Host 'Waiting for server to be ready...' -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    if ($serverProcess.HasExited) {
        Write-Host 'Error: Development server process exited' -ForegroundColor Red
        Read-Host 'Press Enter to exit'
        exit 1
    }
    Start-Sleep -Milliseconds 500
    try {
        $null = Invoke-WebRequest -Uri $serverUrl -UseBasicParsing -TimeoutSec 2
        $ready = $true
        break
    } catch {
    }
}

if (-not $ready) {
    Write-Host 'Error: Server startup timeout (30 seconds)' -ForegroundColor Red
    Stop-ProcessTree $serverProcess.Id
    Read-Host 'Press Enter to exit'
    exit 1
}

Write-Host 'Server is ready!' -ForegroundColor Green

Write-Host "Opening $browserName ..." -ForegroundColor Yellow
$browserArgs = "--user-data-dir=`"$tempProfile`" --new-window --no-first-run --no-default-browser-check --start-maximized $serverUrl"
$browserProcess = Start-Process -FilePath $browserPath -ArgumentList $browserArgs -PassThru -WindowStyle Normal

Start-Sleep -Seconds 2

if ($browserProcess.HasExited) {
    Write-Host 'Warning: Browser process exited, may have failed to start' -ForegroundColor Red
} else {
    Write-Host "Browser started (PID: $($browserProcess.Id))" -ForegroundColor Green
}

Write-Host ''
Write-Host '------------------------------------------------' -ForegroundColor Cyan
Write-Host '  Close browser window to auto-shutdown server' -ForegroundColor Yellow
Write-Host '  Or press Ctrl+C to exit' -ForegroundColor Yellow
Write-Host '------------------------------------------------' -ForegroundColor Cyan
Write-Host ''

try {
    while (-not $browserProcess.HasExited) {
        Start-Sleep -Milliseconds 500
    }
} finally {
    Write-Host ''
    Write-Host 'Shutting down development server...' -ForegroundColor Yellow

    if ($browserProcess -and -not $browserProcess.HasExited) {
        Stop-ProcessTree $browserProcess.Id
    }

    if ($serverProcess -and -not $serverProcess.HasExited) {
        Stop-ProcessTree $serverProcess.Id
    }

    if (Test-Path $tempProfile) {
        Remove-Item $tempProfile -Recurse -Force -ErrorAction SilentlyContinue
    }

    Write-Host 'All resources cleaned up, goodbye!' -ForegroundColor Green
    Start-Sleep -Seconds 1
}