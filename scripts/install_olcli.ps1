$ErrorActionPreference = 'Stop'

$SkillDir = Split-Path -Parent $PSScriptRoot
$SourceDir = Join-Path $SkillDir 'assets\olcli'
$DataRoot = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $HOME 'AppData\Local' }
$InstallRoot = Join-Path $DataRoot 'OverleafRemote'
$InstallDir = Join-Path $InstallRoot 'olcli'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js is required. Install Node.js 18 or newer, then reopen PowerShell.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'npm is required and normally ships with Node.js.'
}

$NodeMajor = [int]((node -p "process.versions.node.split('.')[0]").Trim())
if ($NodeMajor -lt 18) {
  throw "Node.js 18 or newer is required; found $(node --version)."
}

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
if (Test-Path -LiteralPath $InstallDir) {
  $BackupDir = Join-Path $InstallRoot ("olcli.backup." + (Get-Date -Format 'yyyyMMddHHmmss'))
  Move-Item -LiteralPath $InstallDir -Destination $BackupDir -ErrorAction Stop
  Write-Host "Previous bundled installation moved to: $BackupDir"
}

Copy-Item -LiteralPath $SourceDir -Destination $InstallDir -Recurse -ErrorAction Stop
Push-Location $InstallDir
try {
  npm install
  npm run build
  npm link
} finally {
  Pop-Location
}

Write-Host "Installed: $((Get-Command olcli).Source)"
olcli --version
Write-Host "Next: read references/setup-and-cookie.md, then run olcli auth --cookie 'VALUE'."
