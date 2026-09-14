$ErrorActionPreference = 'Stop'

$SkillDir = Split-Path -Parent $PSScriptRoot
$SourceDir = Join-Path $SkillDir 'assets\olcli'
$DataRoot = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $HOME 'AppData\Local' }
$InstallRoot = Join-Path $DataRoot 'OverleafRemote'
$InstallDir = Join-Path $InstallRoot 'olcli'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js is required. Install Node.js 18.17 or newer, then reopen PowerShell.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'npm is required and normally ships with Node.js.'
}

$NodeParts = (node -p "process.versions.node").Trim().Split('.')
$NodeMajor = [int]$NodeParts[0]
$NodeMinor = [int]$NodeParts[1]
if ($NodeMajor -lt 18 -or ($NodeMajor -eq 18 -and $NodeMinor -lt 17)) {
  throw "Node.js 18.17 or newer is required; found $(node --version)."
}

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
if (Test-Path -LiteralPath $InstallDir) {
  $BackupDir = Join-Path $InstallRoot ("olcli.backup." + (Get-Date -Format 'yyyyMMddHHmmss'))
  Move-Item -LiteralPath $InstallDir -Destination $BackupDir -ErrorAction Stop
  Write-Host "Previous bundled installation moved to: $BackupDir"
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Get-ChildItem -LiteralPath $SourceDir -Force |
  Where-Object { $_.Name -ne 'node_modules' } |
  Copy-Item -Destination $InstallDir -Recurse -Force -ErrorAction Stop
Push-Location $InstallDir
try {
  # dist/ is bundled and verified in CI. Avoid two redundant prepare/build runs.
  npm ci --omit=dev --ignore-scripts
  npm link --ignore-scripts
} finally {
  Pop-Location
}

Write-Host "Installed: $((Get-Command olcli).Source)"
olcli --version
Write-Host "Next: read references/setup-and-cookie.md, then pipe the cookie to olcli auth --stdin."
