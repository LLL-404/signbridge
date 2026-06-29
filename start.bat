@echo off
chcp 65001 >nul
title SignBridge 一键启动
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0start.ps1"
if %ERRORLEVEL% neq 0 (
    echo.
    echo 启动失败，请按任意键退出...
    pause >nul
)
