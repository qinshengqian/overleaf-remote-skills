$ErrorActionPreference = 'Stop'
$Command = Get-Command olcli -ErrorAction Stop
Write-Host "Executable: $($Command.Source)"
Write-Host "Version: $(olcli --version)"
olcli check
