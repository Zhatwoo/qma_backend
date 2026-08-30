# Frees port 3001 if another backend instance is still running.
$connections = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if (-not $connections) {
  Write-Host "Port 3001 is free."
  exit 0
}

$pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($procId in $pids) {
  try {
    Stop-Process -Id $procId -Force -ErrorAction Stop
    Write-Host "Stopped process $procId on port 3001."
  } catch {
    Write-Host "Could not stop process ${procId}: $_"
  }
}
