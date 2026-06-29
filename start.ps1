# SignBridge 一键启动脚本
# 功能：启动前端开发服务器，自动打开浏览器，Ctrl+C 退出时自动关闭服务器
# 用法：双击 start.bat 或在 PowerShell 中运行 ./start.ps1

$ErrorActionPreference = 'Stop'
$frontendDir = Join-Path $PSScriptRoot 'frontend'
$serverUrl = 'http://localhost:5173/'

# 验证 frontend 目录存在
if (-not (Test-Path (Join-Path $frontendDir 'package.json'))) {
    Write-Host '错误：未找到 frontend/package.json' -ForegroundColor Red
    Read-Host '按回车键退出'
    exit 1
}

Write-Host ''
Write-Host '================================================' -ForegroundColor Cyan
Write-Host '           SignBridge 一键启动                  ' -ForegroundColor Cyan
Write-Host '================================================' -ForegroundColor Cyan
Write-Host ''

# 检查依赖是否已安装，未安装则自动安装
if (-not (Test-Path (Join-Path $frontendDir 'node_modules'))) {
    Write-Host '未找到 node_modules，正在安装依赖...' -ForegroundColor Yellow
    Set-Location $frontendDir
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host '依赖安装失败，请手动运行 npm install' -ForegroundColor Red
        Read-Host '按回车键退出'
        exit 1
    }
    Write-Host '依赖安装完成' -ForegroundColor Green
    Write-Host ''
}

# 后台延迟 3 秒打开浏览器（使用 cmd 避免阻塞主进程）
Start-Process cmd -ArgumentList '/c', 'timeout /t 3 /nobreak >nul && start http://localhost:5173/' -WindowStyle Hidden

Write-Host '正在启动开发服务器...' -ForegroundColor Yellow
Write-Host "浏览器将在 3 秒后自动打开：$serverUrl" -ForegroundColor Yellow
Write-Host ''
Write-Host '------------------------------------------------' -ForegroundColor Cyan
Write-Host '  按 Ctrl+C 退出将自动关闭服务器' -ForegroundColor Yellow
Write-Host '  或直接关闭此窗口' -ForegroundColor Yellow
Write-Host '------------------------------------------------' -ForegroundColor Cyan
Write-Host ''

# 前台运行开发服务器
# Ctrl+C 信号直接传递给 node.exe，自动退出并释放端口
Set-Location $frontendDir
npm run dev
