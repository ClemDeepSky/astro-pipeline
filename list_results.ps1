Get-ChildItem 'D:/Rosette/result' -Filter '*.xisf' | ForEach-Object {
    $mo = [math]::Round($_.Length / 1MB, 0)
    Write-Host "$($_.Name)  — $mo Mo"
}
Write-Host "---"
Get-Content 'D:/Rosette/result/pipeline_status.json' -Raw
