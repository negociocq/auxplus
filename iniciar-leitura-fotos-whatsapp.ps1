param([switch]$VerificarApenas)

$ErrorActionPreference = 'Stop'
$appFolder = $PSScriptRoot
$proxyScript = Join-Path $appFolder 'scripts\ges-proxy-server.mjs'
$localFolder = Join-Path $appFolder '.local'
$tokenPath = Join-Path $localFolder 'ocr-token'
$mutex = New-Object System.Threading.Mutex($false, 'Local\AuxPlusPhotoOcrLauncher')
$ownsMutex = $false

try {
    $ownsMutex = $mutex.WaitOne(0)
    if (-not $ownsMutex) { throw 'O iniciador de leitura de fotos ja esta aberto. Aguarde a verificacao terminar.' }
    Write-Host 'AuxPlus - Leitura de fotos no WhatsApp' -ForegroundColor Cyan
    Write-Host ''
    if (-not (Test-Path -LiteralPath $proxyScript)) { throw 'O servidor AuxPlus nao foi encontrado nesta pasta.' }
    if (-not (Test-Path -LiteralPath $tokenPath)) {
        throw 'A configuracao privada da leitura de fotos nao foi encontrada. Nao gere outra chave: restaure a configuracao deste PC.'
    }
    $ocrToken = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
    if ($ocrToken -notmatch '^[a-f0-9]{64}$') { throw 'Configuracao privada da leitura invalida.' }
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $nodeCommand) { throw 'Node.js nao encontrado. Instale o Node.js para iniciar o leitor.' }
    foreach ($dependency in @('sharp','tesseract.js','@tesseract.js-data\eng')) {
        if (-not (Test-Path -LiteralPath (Join-Path $appFolder "node_modules\$dependency"))) {
            throw 'As dependencias do AuxPlus nao estao instaladas nesta pasta.'
        }
    }

    # Photo OCR is part of the existing UniPlay proxy; never open a second
    # listener or a second public tunnel on the same port.
    $listener = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
        $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
        if ($owner.Name -ne 'node.exe' -or $owner.CommandLine -notlike '*ges-proxy-server.mjs*') {
            throw 'A porta 8787 esta ocupada por outro programa. Nenhum processo foi encerrado.'
        }
        Write-Host 'O servidor AuxPlus ja esta rodando. Usando o mesmo servico.' -ForegroundColor Green
    } elseif ($VerificarApenas) {
        throw 'O servidor nao esta iniciado. Execute o atalho Leitura de fotos WhatsApp.'
    } else {
        if (-not (Test-Path -LiteralPath $localFolder)) { New-Item -ItemType Directory -Path $localFolder | Out-Null }
        Start-Process -FilePath $nodeCommand.Source -ArgumentList @('scripts/ges-proxy-server.mjs') -WorkingDirectory $appFolder -WindowStyle Hidden -RedirectStandardOutput (Join-Path $localFolder 'photo-start-out.log') -RedirectStandardError (Join-Path $localFolder 'photo-start-error.log') | Out-Null
        Write-Host 'Iniciando o leitor em segundo plano...'
    }

    $ready = $false
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
        try {
            $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/ocr/health' -Headers @{ Authorization = "Bearer $ocrToken" } -TimeoutSec 2
            if ($health.provider -eq 'local' -and $health.ready -eq $true) { $ready = $true; break }
        } catch {
            if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) {
                throw 'A chave do servico em execucao nao corresponde a configuracao deste PC. Nenhuma chave foi alterada.'
            }
        }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) { throw 'O leitor nao respondeu. Confira o registro .local\photo-start-error.log ou o terminal do AuxPlus.' }

    Write-Host ''
    Write-Host 'LEITURA DE FOTOS PRONTA NESTE PC.' -ForegroundColor Green
    Write-Host 'Voce pode fechar esta janela. O servico continua em segundo plano.'
    Write-Host ''
    Write-Host 'Para funcionar no WhatsApp online:' -ForegroundColor Yellow
    Write-Host 'Mantenha tambem o iniciador AuxPlus UniPlay funcionando (ele abre o tunel).'
    Write-Host 'Se o tunel gerar um endereco novo, atualize o Proxy API no AuxPlus.'
    Write-Host 'Este iniciador usa o mesmo tunel e nao altera a chave nem o endereco salvo.'
    exit 0
} catch {
    Write-Host ''
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    if ($ownsMutex) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
