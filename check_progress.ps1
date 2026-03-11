$rootDir = "D:/Rosette"
$hCal = (Get-ChildItem "$rootDir/H/calibrated" -Filter "*_c.xisf" -ErrorAction SilentlyContinue | Measure-Object).Count
$oCal = (Get-ChildItem "$rootDir/O/calibrated" -Filter "*_c.xisf" -ErrorAction SilentlyContinue | Measure-Object).Count
$sCal = (Get-ChildItem "$rootDir/S/calibrated" -Filter "*_c.xisf" -ErrorAction SilentlyContinue | Measure-Object).Count
$hAbe = (Get-ChildItem "$rootDir/H/calibrated" -Filter "*_c_abe.xisf" -ErrorAction SilentlyContinue | Measure-Object).Count
$oAbe = (Get-ChildItem "$rootDir/O/calibrated" -Filter "*_c_abe.xisf" -ErrorAction SilentlyContinue | Measure-Object).Count
$sAbe = (Get-ChildItem "$rootDir/S/calibrated" -Filter "*_c_abe.xisf" -ErrorAction SilentlyContinue | Measure-Object).Count
$hAppr = (Get-ChildItem "$rootDir/H/calibrated" -Filter "*_c_abe_a.xisf" -ErrorAction SilentlyContinue | Measure-Object).Count
$oAppr = (Get-ChildItem "$rootDir/O/calibrated" -Filter "*_c_abe_a.xisf" -ErrorAction SilentlyContinue | Measure-Object).Count
$sAppr = (Get-ChildItem "$rootDir/S/calibrated" -Filter "*_c_abe_a.xisf" -ErrorAction SilentlyContinue | Measure-Object).Count
$hAl = (Get-ChildItem "$rootDir/H/calibrated" -Filter "*_c_abe_a_r.xisf" -ErrorAction SilentlyContinue | Measure-Object).Count
$oAl = (Get-ChildItem "$rootDir/O/calibrated" -Filter "*_c_abe_a_r.xisf" -ErrorAction SilentlyContinue | Measure-Object).Count
$sAl = (Get-ChildItem "$rootDir/S/calibrated" -Filter "*_c_abe_a_r.xisf" -ErrorAction SilentlyContinue | Measure-Object).Count
$result = (Get-ChildItem "$rootDir/result" -Filter "*.xisf" -ErrorAction SilentlyContinue | Measure-Object).Count
$status = Get-Content "$rootDir/result/pipeline_status.json" -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
$phase = if ($status) { "$($status.phase) / $($status.msg)" } else { "?" }
$startUtc = if ($status) { $status.ts } else { "?" }
Write-Host "PHASE    : $phase"
Write-Host "START    : $startUtc (UTC)"
Write-Host "HEURE    : $(Get-Date -Format 'HH:mm:ss') locale"
Write-Host "---"
Write-Host "H  : cal=$hCal/98  abe=$hAbe  approuve=$hAppr  aligne=$hAl"
Write-Host "O  : cal=$oCal/57  abe=$oAbe  approuve=$oAppr  aligne=$oAl"
Write-Host "S  : cal=$sCal/80  abe=$sAbe  approuve=$sAppr  aligne=$sAl"
Write-Host "---"
Write-Host "result/  : $result fichiers .xisf"
# Dernier fichier modifie
$last = Get-ChildItem "$rootDir" -Recurse -Filter "*.xisf" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($last) { Write-Host "Dernier  : $($last.Name)  @ $($last.LastWriteTime)" }
