foreach ($f in @("H","O","S")) {
    $dir = "D:\Rosette\" + $f + "\calibrated"
    if (Test-Path $dir) {
        $files = Get-ChildItem $dir -File
        $n = $files.Count
        Write-Output ($f + "\calibrated : " + $n + " fichiers")
        if ($n -gt 0) {
            Write-Output ("  premier : " + $files[0].Name)
            Write-Output ("  dernier : " + $files[$n-1].Name)
        }
    } else {
        Write-Output ($f + "\calibrated : pas encore créé")
    }
}
# Status pipeline
$st = "D:\Rosette\result\pipeline_status.json"
if (Test-Path $st) {
    Write-Output "`n=== STATUS ==="
    Get-Content $st
}
