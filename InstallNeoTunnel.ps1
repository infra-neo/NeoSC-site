<#
    .SYNOPSIS
        NeoSC Hardened VM Initialization Script for Windows Server 2025
    .DESCRIPTION
        Installs NetBird silently, configures full routing bypass, hardens SSH
        port forwarding for TSplus, and mask names using custom VDI naming.
#>
Start-Transcript -Path "C:\neosc_init_log.txt" -Append
Write-Host "=== Iniciando Despliegue NeoSC Hardened Engine ==="

# --- [ 1. CONFIGURACIÓN DE IDENTIDAD Y NETWORK PARAMS ] ---

# ANTES: $SetupKey estaba hardcodeado igual para TODAS las VMs, lo cual rompía
# el matching por grupo en NetBird (todas las VMs terminaban en el mismo grupo
# viejo en vez del grupo de su propia orden). Ahora viene de CONTEXT, inyectado
# por el backend en cada /vm/instantiate — un setup key distinto por orden.
$SetupKey = $env:NEOSC_SETUP_KEY
$OrderId  = $env:NEOSC_ORDER_ID

if ([string]::IsNullOrWhiteSpace($SetupKey)) {
    Write-Host "AVISO: NEOSC_SETUP_KEY no vino en CONTEXT - usando key de fallback (NO recomendado en produccion)"
    $SetupKey = "CF1144CE-2651-4D4D-8A27-DC672E93988F"
}
if ([string]::IsNullOrWhiteSpace($OrderId)) {
    Write-Host "AVISO: NEOSC_ORDER_ID no vino en CONTEXT - el callback al backend se omitira al final"
}

$VdiPrefix      = "NEOSC-VDI"
$RandomID       = Get-Random -Minimum 1000 -Maximum 9999
$CustomHostname = "$VdiPrefix-$RandomID" # Ejemplo: NEOSC-VDI-4821

# Cambiar el hostname real del sistema Windows para que coincida con el inventario
Rename-Computer -NewName $CustomHostname -Force -ErrorAction SilentlyContinue

# --- [ 2. INSTALACIÓN SILENCIOSA DEL BINARIO ] ---
if (-not (Test-Path "C:\Program Files\NetBird\netbird.exe")) {
    $Url = "https://pkgs.netbird.io/windows/x64"
    $InstallerPath = "$env:TEMP\neosc-installer.exe"
    Invoke-WebRequest -Uri $Url -OutFile $InstallerPath -UseBasicParsing

    # Instalación silenciosa nativa de Windows
    Start-Process -FilePath $InstallerPath -ArgumentList "/S" -Wait
    Remove-Item $InstallerPath -Force
}

# --- [ 3. CONFIGURACIÓN Y LEVANTAMIENTO DEL TÚNEL HARDENIZED ] ---
$NetBirdCli = "C:\Program Files\NetBird\netbird.exe"
Write-Host "Inyectando parámetros de seguridad y conectividad NeoSC..."

# Ejecución del comando UP con todas tus reglas específicas
& $NetBirdCli up `
    --setup-key "$SetupKey" `
    --hostname "$CustomHostname" `
    --no-browser `
    --disable-auto-connect=false `
    --disable-client-routes=false `
    --disable-server-routes=false `
    --disable-ssh-auth=true `
    --enable-ssh-root=true `
    --enable-ssh-local-port-forwarding=true `
    --enable-ssh-remote-port-forwarding=true

# --- [ 4. CAMBIO DE MARCA (WHITE-LABEL A NeoSC) ] ---
Write-Host "Aplicando White-Label en Servicios de Windows..."

# Detener el servicio temporalmente para aplicar cambios corporativos
Stop-Service -Name "NetBird" -ErrorAction SilentlyContinue

# Modificar el nombre para mostrar en el Administrador de Servicios de Windows (Services.msc)
# El cliente final o contador solo verá "NeoSC Network Core Service"
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\NetBird" -Name "DisplayName" -Value "NeoSC Network Core Service"
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\NetBird" -Name "Description" -Value "Engine de conectividad segura y aprovisionamiento automático NeoSC."

# Asegurar que el servicio SIEMPRE inicie automáticamente al encender la VM
Set-Service -Name "NetBird" -StartupType Automatic
Start-Service -Name "NetBird"

# --- [ 5. CONFIGURACIÓN RDP & TSPLUS LOCAL ] ---
Set-ItemProperty "HKLM:\System\CurrentControlSet\Control\Terminal Server" -Name fDenyTSConnections -Value 0
Enable-NetFirewallRule -DisplayGroup "Remote Desktop" -ErrorAction SilentlyContinue | Out-Null

Write-Host "=== Configuración de Nodo NeoSC Completada ==="
& $NetBirdCli status

# --- [ 6. AVISO AL BACKEND: PEER LISTO (reemplaza el polling ciego del backend) ] ---
# En vez de que manager.kappa4.com adivine por nombre/tiempo cuándo esta VM ya
# está en NetBird, la VM avisa directamente con SU PROPIO peer_id apenas se
# conecta. Esto NO usa ningún token de NetBird - solo datos que la VM ya sabe
# de sí misma. El backend es quien tiene el NETBIRD_CLOUD_TOKEN real y crea
# los servicios reverse-proxy (RDP + HTML5) del lado seguro.
if (-not [string]::IsNullOrWhiteSpace($OrderId)) {
    Write-Host "Esperando confirmación de conexión NetBird para avisar al backend..."
    $maxAttempts = 30
    $attempt = 0
    $peerId = $null
    $netbirdIp = $null

    while ($attempt -lt $maxAttempts) {
        try {
            $statusJson = & $NetBirdCli status --json | ConvertFrom-Json
            if ($statusJson.management.connected -eq $true -and $statusJson.netbirdIp) {
                $peerId    = $statusJson.peerId
                $netbirdIp = ($statusJson.netbirdIp -split '/')[0]   # quita el /32 del CIDR
                break
            }
        } catch {
            Write-Host "  (netbird status --json aun no responde, reintentando...)"
        }
        Start-Sleep -Seconds 2
        $attempt++
    }

    if ($peerId) {
        Write-Host "Peer conectado: $peerId ($netbirdIp) - avisando al backend..."
        $body = @{
            order_id   = $OrderId
            peer_id    = $peerId
            netbird_ip = $netbirdIp
        } | ConvertTo-Json

        try {
            $callbackUrl = "https://manager.kappa4.com/api/internal/vm/netbird-ready"
            $response = Invoke-RestMethod -Uri $callbackUrl -Method POST `
                -Body $body -ContentType "application/json" -TimeoutSec 30
            Write-Host "Backend confirmo: RDP=$($response.rdp_url) HTML5=$($response.html_url)"
        } catch {
            Write-Host "AVISO: Callback al backend fallo: $($_.Exception.Message)"
            Write-Host "El backend igual va a detectar esta VM por su polling de respaldo."
        }
    } else {
        Write-Host "AVISO: El peer no confirmo conexion tras $maxAttempts intentos - se omite el callback."
    }
}

Stop-Transcript
