@echo off
title The Spike Cross Guide - Preview
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Root "%~dp0.." -Port 5500 -Open
pause
