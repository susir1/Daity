# Daity NSIS 安装包构建脚本
# 请右键 → 以管理员身份运行 PowerShell，然后执行此脚本
# 或者：以管理员打开 PowerShell，cd 到本项目目录，运行 .\build-installer.ps1

$ErrorActionPreference = "Continue"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Daity NSIS 安装包构建" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 配置镜像源（国内加速）
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"

Set-Location $PSScriptRoot

Write-Host "[1/2] 清理旧缓存..." -ForegroundColor Yellow
$cacheDir = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
if (Test-Path $cacheDir) {
    Remove-Item -Recurse -Force $cacheDir -ErrorAction SilentlyContinue
}

Write-Host "[2/2] 开始构建（需要联网下载约 120MB）..." -ForegroundColor Yellow
Write-Host ""

npx electron-builder --win

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  构建完成!" -ForegroundColor Green
Write-Host "  安装包位置: dist\Daity Setup 1.0.0.exe" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green

Read-Host "按 Enter 退出"
