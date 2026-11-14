@echo off
rem Stop Hermes. Use "stop.bat -StopDatabase" to also stop PostgreSQL.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop_stack.ps1" %*
if errorlevel 1 pause
