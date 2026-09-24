@echo off
chcp 65001 >nul
cd /d %~dp0
title JM下载器
start "" http://127.0.0.1:8080
python server.py
pause
