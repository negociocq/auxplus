@echo off
setlocal
title AuxPlus - Leitura de fotos do WhatsApp
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0iniciar-leitura-fotos-whatsapp.ps1"
set "AUXPLUS_PHOTO_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %AUXPLUS_PHOTO_EXIT%
