foreach ($f in @("H","O","S")) {
    $files = Get-ChildItem "D:\Rosette\$f" -File -ErrorAction SilentlyContinue
    $count = $files.Count
    $first = if ($files.Count -gt 0) { $files[0].Name } else { "vide" }
    Write-Output "$f : $count fichiers"
    Write-Output "  ex: $first"
}
