$ErrorActionPreference = "Stop"

$WorkerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Doctor = Join-Path $WorkerDir "doctor.mjs"
$Worker = Join-Path $WorkerDir "index.mjs"
$GatewayFile = Join-Path $WorkerDir "gateway.url"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js 22.13+ nao encontrado no PATH."
  exit 1
}

if (-not $env:NEXUS_WORKER_TOKEN) {
  $secure = Read-Host "Cole o token nxw1_ do Nexus Worker" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $env:NEXUS_WORKER_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

if (-not $env:NEXUS_WORKER_GATEWAY_URL -and -not $env:NEXUS_BASE_URL -and (Test-Path $GatewayFile)) {
  $env:NEXUS_WORKER_GATEWAY_URL = (Get-Content -Raw $GatewayFile).Trim()
}

if (-not $env:NEXUS_WORKER_GATEWAY_URL -and -not $env:NEXUS_BASE_URL) {
  Write-Error "Defina NEXUS_WORKER_GATEWAY_URL ou NEXUS_BASE_URL antes de iniciar."
  exit 1
}

Write-Host "[NEXUS] executando preflight seguro..."
& node $Doctor
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[NEXUS] preflight aprovado; iniciando worker allowlisted."
& node $Worker
exit $LASTEXITCODE
