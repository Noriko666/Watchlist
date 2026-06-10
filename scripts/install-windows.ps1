[CmdletBinding()]
param(
  [switch]$Start,
  [switch]$Dev,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Checked {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath failed with exit code $LASTEXITCODE"
  }
}

Push-Location $Root
try {
  Write-Step "Checking Node.js"
  try {
    $nodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
  } catch {
    throw "Node.js 20 or newer is required. Install it from https://nodejs.org/ and run this script again."
  }

  if ($nodeMajor -lt 20) {
    throw "Node.js 20 or newer is required. Current major version: $nodeMajor"
  }

  Write-Step "Checking npm"
  Invoke-Checked "npm" @("--version")

  if (-not (Test-Path -LiteralPath ".env")) {
    Write-Step "Creating .env from .env.example"
    Copy-Item -LiteralPath ".env.example" -Destination ".env"
  } else {
    Write-Step ".env already exists"
  }

  Write-Step "Installing dependencies"
  Invoke-Checked "npm" @("install")

  if (-not $SkipBuild) {
    Write-Step "Building frontend"
    Invoke-Checked "npm" @("run", "build")
  }

  Write-Host ""
  Write-Host "Watchlist is ready." -ForegroundColor Green
  Write-Host "Local URL: http://127.0.0.1:4310"

  if ($Dev) {
    Write-Step "Starting development mode"
    Invoke-Checked "npm" @("run", "dev")
  } elseif ($Start) {
    Write-Step "Starting production server"
    Invoke-Checked "npm" @("start")
  } else {
    Write-Host "Run npm start to launch the app."
  }
} finally {
  Pop-Location
}
