param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA "NexusWorker"),
  [string]$GatewayUrl = "",
  [switch]$Start,
  [switch]$EnableAutostart
)

$ErrorActionPreference = "Stop"
$SourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($EnableAutostart) {
  throw "NEXUS_AUTOSTART_BLOCKED: esta versao nao persiste o token nxw1_. Autostart desassistido permanece bloqueado ate existir armazenamento seguro por SO."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 22.13+ nao encontrado no PATH."
}

Write-Host "[NEXUS INSTALL] verificando pacote de origem..."
& node (Join-Path $SourceDir "verify.mjs")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $GatewayUrl) {
  $GatewayUrl = Read-Host "Gateway HTTPS do Nexus Worker"
}

$uri = $null
if (-not [Uri]::TryCreate($GatewayUrl.Trim(), [UriKind]::Absolute, [ref]$uri)) {
  throw "NEXUS_GATEWAY_URL_invalid"
}
$localHttp = $uri.Scheme -eq "http" -and @("localhost", "127.0.0.1", "::1") -contains $uri.Host
if ($uri.Scheme -ne "https" -and -not $localHttp) {
  throw "NEXUS_GATEWAY_URL_must_use_https"
}

$manifest = Get-Content -Raw (Join-Path $SourceDir "worker-manifest.json") | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

foreach ($file in $manifest.files) {
  Copy-Item -Force (Join-Path $SourceDir $file) (Join-Path $InstallDir $file)
}
Copy-Item -Force (Join-Path $SourceDir "SHA256SUMS") (Join-Path $InstallDir "SHA256SUMS")
Set-Content -Path (Join-Path $InstallDir "gateway.url") -Value $GatewayUrl.Trim() -Encoding UTF8

Write-Host "[NEXUS INSTALL] verificando instalacao..."
& node (Join-Path $InstallDir "verify.mjs")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[NEXUS INSTALL] OK: $InstallDir"
Write-Host "[NEXUS INSTALL] token nao foi salvo. O launcher pedira nxw1_ ao iniciar."

if ($Start) {
  Write-Host "[NEXUS INSTALL] iniciando worker..."
  & (Join-Path $InstallDir "start.ps1")
  exit $LASTEXITCODE
}

Write-Host "Para iniciar: & `"$(Join-Path $InstallDir 'start.ps1')`""
