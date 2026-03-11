$path = 'D:/Rosette/result/pipeline_log_complet.txt'
if (Test-Path $path) {
    $f = Get-Item $path
    Write-Host "Fichier: $($f.Length) octets"
    Get-Content $path -Encoding UTF8
} else {
    Write-Host "ABSENT - le fichier n'existe pas"
}
