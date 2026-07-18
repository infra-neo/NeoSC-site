<#
    .SYNOPSIS
        NeoSC Route Installer — convierte una VM Windows existente del cliente
        en un Gateway/routing peer de NeoMesh (NetBird), sin necesidad del
        mini-PC NanoPi/N100 dedicado.
    .DESCRIPTION
        1. Pide el token de activacion (generado al momento de la compra)
        2. Se activa contra el backend NeoSC -> recibe setup_key + gateway_id
        3. Instala NetBird, levanta el tunel con --enable-server-routes=true
        4. Detecta la subred local y la confirma con el usuario
        5. Avisa al backend -> se crea la Network Route real en NetBird
        6. Deja un scheduled task de heartbeat cada 5 min
    .USAGE
        .\Route-Installer.ps1
        .\Route-Installer.ps1 -Token "NEOSC-GW-XXXXXXXX-XXXXXXXX"
#>
param(
    [string]$Token = "",
    [string]$BackendUrl = "https://manager.kappa4.com/api"
)

$ErrorActionPreference = "Stop"
Start-Transcript -Path "C:\neosc_gateway_install_log.txt" -Append

Write-Host "=== NeoSC Route Installer ===" -ForegroundColor Cyan
Write-Host "Este equipo se va a convertir en el Gateway de NeoSC para tu red." -ForegroundColor Cyan
Write-Host ""

# --- [ 1. TOKEN DE ACTIVACION ] ---
if ([string]::IsNullOrWhiteSpace($Token)) {
    $Token = Read-Host "Ingresa tu token de activacion (formato NEOSC-GW-XXXXXXXX-XXXXXXXX)"
}
if ([string]::IsNullOrWhiteSpace($Token)) {
    Write-Host "ERROR: se necesita un token de activacion para continuar." -ForegroundColor Red
    Stop-Transcript
    exit 1
}

# --- [ 2. ACTIVACION CONTRA EL BACKEND ] ---
Write-Host "Activando..." -ForegroundColor Yellow
try {
    $activateBody = @{
        token     = $Token
        hostname  = $env:COMPUTERNAME
        os_info   = (Get-CimInstance Win32_OperatingSystem).Caption
    } | ConvertTo-Json

    $activation = Invoke-RestMethod -Uri "$BackendUrl/gateway/activate" -Method POST `
        -Body $activateBody -ContentType "application/json" -TimeoutSec 30
} catch {
    Write-Host "ERROR: activacion fallo - $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Verifica que el token sea correcto y no haya expirado (valido 48h desde la compra)."
    Stop-Transcript
    exit 1
}

$GatewayId     = $activation.gateway_id
$GatewaySecret = $activation.gateway_secret
$SetupKey      = $activation.setup_key
Write-Host "Activado. gateway_id=$GatewayId" -ForegroundColor Green

# Guarda las credenciales localmente para que el heartbeat programado las use despues.
# NOTA DE SEGURIDAD: esto queda en disco en texto plano por simplicidad de MVP.
# Para produccion, cifrar con Protect-CmsMessage o mover a mTLS (ver documentacion).
$CredsPath = "C:\ProgramData\NeoSC\gateway-credentials.json"
New-Item -ItemType Directory -Path (Split-Path $CredsPath) -Force | Out-Null
@{ gateway_id = $GatewayId; gateway_secret = $GatewaySecret; backend_url = $BackendUrl } |
    ConvertTo-Json | Set-Content -Path $CredsPath -Encoding UTF8

# --- [ 3. INSTALACION Y LEVANTAMIENTO DE NETBIRD ] ---
Write-Host "Instalando NetBird..." -ForegroundColor Yellow
if (-not (Test-Path "C:\Program Files\NetBird\netbird.exe")) {
    $Url = "https://pkgs.netbird.io/windows/x64"
    $InstallerPath = "$env:TEMP\neosc-gateway-installer.exe"
    Invoke-WebRequest -Uri $Url -OutFile $InstallerPath -UseBasicParsing
    Start-Process -FilePath $InstallerPath -ArgumentList "/S" -Wait
    Remove-Item $InstallerPath -Force
}

$NetBirdCli = "C:\Program Files\NetBird\netbird.exe"

# --enable-server-routes=true es la diferencia clave vs un cliente normal:
# esto es lo que le permite a este peer actuar como routing peer / gateway
# para toda la subred, no solo para si mismo.
& $NetBirdCli up `
    --setup-key "$SetupKey" `
    --hostname "NEOSC-GW-$env:COMPUTERNAME" `
    --no-browser `
    --enable-server-routes=true `
    --disable-auto-connect=false

# White-label (mismo patron que InstallNeoTunnel.ps1)
Stop-Service -Name "NetBird" -ErrorAction SilentlyContinue
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\NetBird" -Name "DisplayName" -Value "NeoSC Gateway Service" -ErrorAction SilentlyContinue
Set-Service -Name "NetBird" -StartupType Automatic -ErrorAction SilentlyContinue
Start-Service -Name "NetBird" -ErrorAction SilentlyContinue

# --- [ 4. DETECCION DE SUBRED LOCAL ] ---
Write-Host "Detectando tu red local..." -ForegroundColor Yellow
$localIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.InterfaceAlias -notmatch "Loopback|NetBird|vEthernet" -and $_.IPAddress -notmatch "^169\.254"
} | Select-Object -First 1)

$suggestedCidr = $null
if ($localIp) {
    $prefix = $localIp.PrefixLength
    $ipParts = $localIp.IPAddress -split '\.'
    # Asume /24 para la sugerencia si el prefix real es mas amplio/raro - el usuario confirma igual
    $suggestedCidr = "$($ipParts[0]).$($ipParts[1]).$($ipParts[2]).0/$prefix"
}

$SubnetCidr = Read-Host "Confirma la subred a proteger [$suggestedCidr]"
if ([string]::IsNullOrWhiteSpace($SubnetCidr)) { $SubnetCidr = $suggestedCidr }

if ([string]::IsNullOrWhiteSpace($SubnetCidr)) {
    Write-Host "ERROR: no se pudo determinar la subred. Vuelve a correr el instalador con la red conectada." -ForegroundColor Red
    Stop-Transcript
    exit 1
}

# --- [ 5. OBTENER PEER_ID Y CONFIRMAR RUTA CON EL BACKEND ] ---
Write-Host "Esperando confirmacion de NetBird..." -ForegroundColor Yellow
$maxAttempts = 30
$attempt = 0
$peerId = $null
while ($attempt -lt $maxAttempts) {
    try {
        $statusJson = & $NetBirdCli status --json | ConvertFrom-Json
        if ($statusJson.management.connected -eq $true) {
            $peerId = $statusJson.peerId
            break
        }
    } catch {}
    Start-Sleep -Seconds 2
    $attempt++
}

if (-not $peerId) {
    Write-Host "ERROR: NetBird no confirmo conexion a tiempo." -ForegroundColor Red
    Stop-Transcript
    exit 1
}

try {
    $routeBody = @{
        gateway_id     = $GatewayId
        gateway_secret = $GatewaySecret
        peer_id        = $peerId
        subnet_cidr    = $SubnetCidr
    } | ConvertTo-Json

    Invoke-RestMethod -Uri "$BackendUrl/gateway/route-confirmed" -Method POST `
        -Body $routeBody -ContentType "application/json" -TimeoutSec 30 | Out-Null

    Write-Host "Ruta creada: $SubnetCidr -> este Gateway" -ForegroundColor Green
} catch {
    Write-Host "AVISO: no se pudo confirmar la ruta con el backend: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "Contacta a soporte con tu gateway_id: $GatewayId"
}

# --- [ 6. SCHEDULED TASK DE HEARTBEAT ] ---
Write-Host "Configurando heartbeat periodico..." -ForegroundColor Yellow
$heartbeatScript = "C:\ProgramData\NeoSC\gateway-heartbeat.ps1"
@'
$creds = Get-Content "C:\ProgramData\NeoSC\gateway-credentials.json" | ConvertFrom-Json
$body = @{ gateway_id = $creds.gateway_id; gateway_secret = $creds.gateway_secret } | ConvertTo-Json
try {
    Invoke-RestMethod -Uri "$($creds.backend_url)/internal/gateway/heartbeat" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 15 | Out-Null
} catch {}
'@ | Set-Content -Path $heartbeatScript -Encoding UTF8

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$heartbeatScript`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration ([TimeSpan]::MaxValue)
Register-ScheduledTask -TaskName "NeoSC Gateway Heartbeat" -Action $action -Trigger $trigger -RunLevel Highest -Force | Out-Null

Write-Host ""
Write-Host "=== Gateway NeoSC activo ===" -ForegroundColor Green
Write-Host "gateway_id: $GatewayId"
Write-Host "Subred protegida: $SubnetCidr"
Write-Host "Tus empleados ya pueden conectarse via RDP a las maquinas de esa subred, tunelizado por NeoMesh."
Stop-Transcript
