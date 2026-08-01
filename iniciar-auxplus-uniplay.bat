@echo off
chcp 65001 >nul
title AuxPlus UniPlay - Proxy
set "APP=C:\Users\Premium PC\dyad-apps\auxplus-app-2"
set "CLOUDFLARED=%APP%\tools\cloudflared.exe"

echo ========================================
echo  AuxPlus UniPlay - iniciando proxies
echo ========================================
echo.

if not exist "%APP%\scripts\ges-proxy-server.mjs" (
  echo [ERRO] Pasta do AuxPlus nao encontrada:
  echo %APP%
  pause
  exit /b 1
)

if not exist "%CLOUDFLARED%" (
  echo [ERRO] cloudflared.exe nao encontrado em:
  echo %CLOUDFLARED%
  echo Baixe de novo com o Invoke-WebRequest na pasta tools.
  pause
  exit /b 1
)

echo [1/2] Abrindo ges-proxy na porta 8787...
start "AuxPlus ges-proxy" cmd /k "cd /d "%APP%" && npm run ges-proxy"

timeout /t 2 /nobreak >nul

echo [2/2] Abrindo cloudflared (tunnel)...
start "AuxPlus cloudflared" cmd /k "cd /d "%APP%" && "%CLOUDFLARED%" tunnel --url http://127.0.0.1:8787"

echo.
echo Pronto. Duas janelas foram abertas.
echo.
echo IMPORTANTE:
echo  - Na janela do cloudflared, copie a URL https://....trycloudflare.com
echo  - Cole em AuxPlus - Admin - Automacoes - Proxy API - Salvar
echo  - A URL muda toda vez que o tunnel reinicia
echo.
pause
