# Memastikan PowerShell berjalan sebagai Administrator
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Warning "Script ini membutuhkan akses Administrator. Silakan jalankan PowerShell sebagai Administrator."
    Break
}

# Fungsi untuk memeriksa apakah program sudah terinstal
function Test-CommandExists {
    param ($command)
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'stop'
    try { if (Get-Command $command) { return $true } }
    catch { return $false }
    finally { $ErrorActionPreference = $oldPreference }
}

Write-Host "Memulai setup development environment..." -ForegroundColor Green

# Instal Chocolatey jika belum terinstal
if (!(Test-Path "$env:ProgramData\chocolatey\choco.exe")) {
    Write-Host "Menginstal Chocolatey..." -ForegroundColor Yellow
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))
    refreshenv
}

# Array program yang akan diinstal via Chocolatey
$programs = @(
    @{name = "git"; command = "git"},
    @{name = "nodejs-lts"; command = "node"},
    @{name = "golang"; command = "go"}
)

# Instal program menggunakan Chocolatey
foreach ($prog in $programs) {
    if (!(Test-CommandExists $prog.command)) {
        Write-Host "Menginstal $($prog.name)..." -ForegroundColor Yellow
        choco install $prog.name -y
        refreshenv
    } else {
        Write-Host "$($prog.name) sudah terinstal." -ForegroundColor Green
    }
}

# Mengaktifkan WSL
Write-Host "Mengaktifkan WSL dan Virtual Machine Platform..." -ForegroundColor Yellow
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

# Mengunduh dan menginstal WSL2 Linux kernel update
Write-Host "Mengunduh dan menginstal WSL2 Linux kernel update..." -ForegroundColor Yellow
$wslUpdateUrl = "https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi"
$wslUpdateFile = "$env:TEMP\wsl_update_x64.msi"
Invoke-WebRequest -Uri $wslUpdateUrl -OutFile $wslUpdateFile
Start-Process msiexec.exe -ArgumentList "/I $wslUpdateFile /quiet" -Wait
Remove-Item $wslUpdateFile

# Set WSL 2 sebagai versi default
wsl --set-default-version 2

# Menginstal Ubuntu
Write-Host "Menginstal Ubuntu di WSL..." -ForegroundColor Yellow
wsl --install -d Ubuntu

Write-Host "`nSetup Windows selesai!" -ForegroundColor Green
Write-Host "`nLangkah selanjutnya:" -ForegroundColor Yellow
Write-Host "1. Restart komputer Anda"
Write-Host "2. Setelah restart, Ubuntu akan otomatis mulai dan meminta Anda membuat username dan password"
Write-Host "3. Setelah masuk ke Ubuntu, jalankan script ubuntu-setup.sh untuk melanjutkan instalasi"
Write-Host "`nApakah Anda ingin restart komputer sekarang? (Y/N)" -ForegroundColor Yellow
$restart = Read-Host

if ($restart -eq 'Y' -or $restart -eq 'y') {
    Restart-Computer
}