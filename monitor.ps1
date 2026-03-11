$timeout  = 7200   # 2h max
$elapsed  = 0
$interval = 30

while ($elapsed -lt $timeout) {
    Start-Sleep -Seconds $interval
    $elapsed += $interval
    $path = "D:\Rosette\result\pipeline_status.json"
    if (Test-Path $path) {
        $content = Get-Content $path -Raw
        Write-Output ("[$elapsed" + "s] " + $content.Trim())
        if ($content -match "ALL_DONE|COMPLETE|ERROR") { break }
    } else {
        Write-Output ("[$elapsed" + "s] En attente demarrage...")
    }
}
