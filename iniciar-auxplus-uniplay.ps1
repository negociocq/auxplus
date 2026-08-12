# AuxPlus UniPlay - Proxy (ges-proxy + cloudflared)
# Script PowerShell para iniciar os proxies

$APP = "C:\Users\Premium PC\dyad-apps\auxplus-app-2"
$CLOUDFLARED = "$APP\tools\cloudflared.exe"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " AuxPlus UniPlay - iniciando proxies" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Passo 1: Verifica pasta do AuxPlus
Write-Host "[PASSO 1] Verificando pasta do AuxPlus..." -ForegroundColor Yellow
$ges_proxy = "$APP\scripts\ges-proxy-server.mjs"
if (-not (Test-Path $ges_proxy)) {
    Write-Host "[ERRO] Pasta do AuxPlus nao encontrada:" -ForegroundColor Red
    Write-Host "$APP" -ForegroundColor Red
    Read-Host "Pressione ENTER para sair"
    exit 1
}
Write-Host "[OK] Pasta encontrada" -ForegroundColor Green
Write-Host ""

# Passo 2: Verifica cloudflared
Write-Host "[PASSO 2] Verificando cloudflared..." -ForegroundColor Yellow
if (-not (Test-Path $CLOUDFLARED)) {
    Write-Host "[ERRO] cloudflared.exe nao encontrado em:" -ForegroundColor Red
    Write-Host "$CLOUDFLARED" -ForegroundColor Red
    Write-Host "" -ForegroundColor Yellow
    Write-Host "Para baixar novamente, abra PowerShell como Admin e execute:" -ForegroundColor Yellow
    Write-Host "  cd $APP\tools" -ForegroundColor Cyan
    Write-Host "  Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/download/2024.8.3/cloudflared-windows-amd64.exe' -OutFile 'cloudflared.exe'" -ForegroundColor Cyan
    Read-Host "Pressione ENTER para sair"
    exit 1
}
Write-Host "[OK] cloudflared.exe encontrado" -ForegroundColor Green
Write-Host ""

# Passo 3: Verifica npm
Write-Host "[PASSO 3] Verificando npm..." -ForegroundColor Yellow
$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npm) {
    Write-Host "[ERRO] npm nao encontrado no PATH" -ForegroundColor Red
    Write-Host "Instale Node.js de: https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "Pressione ENTER para sair"
    exit 1
}
Write-Host "[OK] npm encontrado" -ForegroundColor Green
Write-Host ""

# Passo 4: Inicia ges-proxy
Write-Host "[PASSO 4] Abrindo ges-proxy na porta 8787..." -ForegroundColor Yellow
$ges_window = Start-Process cmd -ArgumentList "/k", "cd /d `"$APP`" && npm run ges-proxy" -PassThru -WindowStyle Normal
Write-Host "[OK] Janela ges-proxy aberta (PID: $($ges_window.Id))" -ForegroundColor Green
Write-Host ""

Start-Sleep -Seconds 2

# Passo 5: Inicia cloudflared
Write-Host "[PASSO 5] Abrindo cloudflared (tunnel)..." -ForegroundColor Yellow
$cf_window = Start-Process cmd -ArgumentList "/k", "cd /d `"$APP`" && `"$CLOUDFLARED`" tunnel --url http://127.0.0.1:8787" -PassThru -WindowStyle Normal
Write-Host "[OK] Janela cloudflared aberta (PID: $($cf_window.Id))" -ForegroundColor Green
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "          TUDO PRONTO!" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Proximos passos:" -ForegroundColor Yellow
Write-Host "1. Na janela do cloudflared, procure por:" -ForegroundColor White
Write-Host "   Forwarding    https://....trycloudflare.com" -ForegroundColor Cyan
Write-Host "2. Copie a URL completa" -ForegroundColor White
Write-Host "3. Cole no AuxPlus:" -ForegroundColor White
Write-Host "   - Admin -> Automacoes" -ForegroundColor White
Write-Host "   - Proxy API -> Salvar" -ForegroundColor White
Write-Host ""
Write-Host "OBS: A URL muda toda vez que o tunnel reinicia" -ForegroundColor Yellow
Write-Host ""

Read-Host "Pressione ENTER para sair"
