$files = Get-ChildItem "D:\Rosette" -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 10
foreach ($f in $files) {
    Write-Output ($f.LastWriteTime.ToString("HH:mm:ss") + "  " + $f.Length + "  " + $f.FullName)
}
Write-Output ""
Write-Output "=== Sous-dossiers ==="
Get-ChildItem "D:\Rosette" -Recurse -Directory | ForEach-Object { Write-Output $_.FullName }
