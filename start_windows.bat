@echo off
cd /d "%~dp0"
where py >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    py -3 server.py
) else (
    python server.py
)
)
pause
