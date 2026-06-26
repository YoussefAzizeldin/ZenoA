$ErrorActionPreference = 'Stop'

$desktop = [Environment]::GetFolderPath('Desktop')
$install = Join-Path $env:LOCALAPPDATA 'Zeno'
$userData = Join-Path $env:APPDATA 'Zeno'
$desktopLauncher = Join-Path $desktop 'Zeno.exe'
$desktopShortcut = Join-Path $desktop 'Zeno.lnk'
$desktopUninstaller = Join-Path $desktop 'Uninstall Zeno.exe'
$desktopUninstallerShortcut = Join-Path $desktop 'Uninstall Zeno.lnk'

Write-Host ''
Write-Host '=========================================='
Write-Host ' Zeno uninstall'
Write-Host '=========================================='
Write-Host ''

$removeDataAnswer = Read-Host 'Remove saved settings, tasks, logs, and WhatsApp auth data too? [y/N]'
$removeData = $removeDataAnswer -match '^(y|yes)$'

Get-Process -Name 'Zeno' -ErrorAction SilentlyContinue |
  Where-Object { $_.Id -ne $PID } |
  Stop-Process -Force -ErrorAction SilentlyContinue

Start-Sleep -Milliseconds 600

foreach ($path in @($desktopLauncher, $desktopShortcut, $desktopUninstaller, $desktopUninstallerShortcut)) {
  if (Test-Path $path) {
    Remove-Item -LiteralPath $path -Force
  }
}

if (Test-Path $install) {
  Remove-Item -LiteralPath $install -Recurse -Force
}

if ($removeData -and (Test-Path $userData)) {
  Remove-Item -LiteralPath $userData -Recurse -Force
}

Write-Host ''
Write-Host 'Zeno has been uninstalled.'
if ($removeData) {
  Write-Host 'Saved app data was removed.'
} else {
  Write-Host 'Saved app data was preserved.'
}
Write-Host ''
