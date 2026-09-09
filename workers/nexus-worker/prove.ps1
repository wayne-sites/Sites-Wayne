$ErrorActionPreference = "Stop"

$WorkerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Verify = Join-Path $WorkerDir "verify.mjs"
$Doctor = Join-Path $WorkerDir "doctor.mjs"
$Pair = Join-Path $WorkerDir "pair.mjs"
$Prove = Join-Path $WorkerDir "prove.mjs"
$Worker = Join-Path $WorkerDir "index.mjs"
$GatewayFile = Join-Path $WorkerDir "gateway.url"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js 22.13+ nao encontrado no PATH."
  exit 1
}

if (-not $env:NEXUS_WORKER_GATEWAY_URL -and -not $env:NEXUS_BASE_URL -and (Test-Path $GatewayFile)) {
  $env:NEXUS_WORKER_GATEWAY_URL = (Get-Content -Raw $GatewayFile).Trim()
}

if (-not $env:NEXUS_WORKER_GATEWAY_URL -and -not $env:NEXUS_BASE_URL) {
  Write-Error "Defina NEXUS_WORKER_GATEWAY_URL ou NEXUS_BASE_URL antes de iniciar."
  exit 1
}

Write-Host "[NEXUS PROOF] verificando integridade do pacote..."
& node $Verify
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $env:NEXUS_WORKER_TOKEN) {
  $secure = Read-Host "Cole o token nxw1_ ou codigo temporario nxp1_" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $secret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }

  if ($secret -like "nxp1_*") {
    if (-not $env:NEXUS_WORKER_GATEWAY_URL) {
      $secret = $null
      Write-Error "NEXUS_WORKER_GATEWAY_URL e obrigatorio para pareamento."
      exit 1
    }
    $env:NEXUS_WORKER_PAIRING_CODE = $secret
    $secret = $null
    try {
      $pairToken = (& node $Pair | Out-String).Trim()
      if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
      $env:NEXUS_WORKER_TOKEN = $pairToken
    }
    finally {
      Remove-Item Env:NEXUS_WORKER_PAIRING_CODE -ErrorAction SilentlyContinue
    }
  }
  else {
    $env:NEXUS_WORKER_TOKEN = $secret
    $secret = $null
  }
}

Write-Host "[NEXUS PROOF] executando Doctor..."
& node $Doctor
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& node $Prove
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($env:NEXUS_WORKER_PROVE_ONLY -eq "1") {
  Remove-Item Env:NEXUS_WORKER_TOKEN -ErrorAction SilentlyContinue
  Write-Host "[NEXUS PROOF] prova concluida; worker nao iniciado por NEXUS_WORKER_PROVE_ONLY=1."
  exit 0
}

Write-Host "[NEXUS PROOF] prova aprovada; iniciando worker com a credencial apenas em memoria."
& node $Worker
$exitCode = $LASTEXITCODE
Remove-Item Env:NEXUS_WORKER_TOKEN -ErrorAction SilentlyContinue
exit $exitCode
