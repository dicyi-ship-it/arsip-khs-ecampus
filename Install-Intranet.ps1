param([Parameter(Mandatory=$true)][string]$PublicUrl)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$uri = [Uri]$PublicUrl
if (-not $uri.IsAbsoluteUri -or $uri.Scheme -notin @('http','https') -or $PublicUrl -ne $uri.GetLeftPart([UriPartial]::Authority)) { throw 'PublicUrl harus origin tanpa / akhir, contoh http://192.168.1.10:3000' }
$nodeVersion = node --version
if ($LASTEXITCODE -ne 0 -or [int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 24) { throw 'Pasang Node.js 24 atau lebih baru.' }
if (-not (Test-Path -LiteralPath 'data/ecampus.sqlite')) { throw 'Database akademik tidak ditemukan.' }
if (Test-Path -LiteralPath '.env') { throw '.env sudah ada. Edit manual agar konfigurasi lama tidak tertimpa.' }
$listenPort = if ($uri.Scheme -eq 'http') { $uri.Port } else { 3000 }
$secure = if ($uri.Scheme -eq 'https') { '1' } else { '0' }
$bindAddress = if ($uri.Scheme -eq 'https') { '127.0.0.1' } else { '0.0.0.0' }
@"
HOST=$bindAddress
PORT=$listenPort
PUBLIC_ORIGINS=$PublicUrl
COOKIE_SECURE=$secure
ECAMPUS_DB=./data/ecampus.sqlite
AUTH_DB=./data/auth.sqlite
"@ | Set-Content -LiteralPath '.env' -Encoding ASCII
if (-not (Test-Path -LiteralPath 'node_modules/exceljs')) {
  npm.cmd ci --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Instalasi dependensi gagal.' }
}
Write-Host "Siap. Jalankan Jalankan.bat lalu buka $PublicUrl/login."
Write-Host 'Untuk autostart dan firewall, ikuti DEPLOY-WINDOWS.md.'
