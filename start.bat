@echo off
rem Start Hermes: API on :8200 and web console on :5273.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start_stack.ps1" %*
if errorlevel 1 pause
