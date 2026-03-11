$logFile = "C:/astro-pipeline/rosette_monitor.log"
$rootDir = "D:/Rosette"
$statusFile = "$rootDir/result/pipeline_status.json"

for ($i = 0; $i -lt 180; $i++) {
    $ts = Get-Date -Format "HH:mm:ss"
    $status = if (Test-Path $statusFile) { Get-Content $statusFile -Raw | ConvertFrom-Json } else { $null }
    $phase = if ($status) { "$($status.phase)/$($status.msg)" } else { "attente" }

    $hCal  = (Get-ChildItem "$rootDir/H/calibrated" -Filter "*_c.xisf"       -EA SilentlyContinue | Measure-Object).Count
    $hAbe  = (Get-ChildItem "$rootDir/H/calibrated" -Filter "*_c_abe.xisf"   -EA SilentlyContinue | Measure-Object).Count
    $hAppr = (Get-ChildItem "$rootDir/H/calibrated" -Filter "*_c_abe_a.xisf" -EA SilentlyContinue | Measure-Object).Count
    $hAl   = (Get-ChildItem "$rootDir/H/calibrated" -Filter "*_c_abe_a_r.xisf" -EA SilentlyContinue | Measure-Object).Count

    $oCal  = (Get-ChildItem "$rootDir/O/calibrated" -Filter "*_c.xisf"       -EA SilentlyContinue | Measure-Object).Count
    $oAbe  = (Get-ChildItem "$rootDir/O/calibrated" -Filter "*_c_abe.xisf"   -EA SilentlyContinue | Measure-Object).Count
    $oAppr = (Get-ChildItem "$rootDir/O/calibrated" -Filter "*_c_abe_a.xisf" -EA SilentlyContinue | Measure-Object).Count
    $oAl   = (Get-ChildItem "$rootDir/O/calibrated" -Filter "*_c_abe_a_r.xisf" -EA SilentlyContinue | Measure-Object).Count

    $sCal  = (Get-ChildItem "$rootDir/S/calibrated" -Filter "*_c.xisf"       -EA SilentlyContinue | Measure-Object).Count
    $sAbe  = (Get-ChildItem "$rootDir/S/calibrated" -Filter "*_c_abe.xisf"   -EA SilentlyContinue | Measure-Object).Count
    $sAppr = (Get-ChildItem "$rootDir/S/calibrated" -Filter "*_c_abe_a.xisf" -EA SilentlyContinue | Measure-Object).Count
    $sAl   = (Get-ChildItem "$rootDir/S/calibrated" -Filter "*_c_abe_a_r.xisf" -EA SilentlyContinue | Measure-Object).Count

    $result = (Get-ChildItem "$rootDir/result" -Filter "*.xisf" -EA SilentlyContinue | Measure-Object).Count

    $line = "[$ts] $phase | H:$hCal/$hAbe/$hAppr/$hAl | O:$oCal/$oAbe/$oAppr/$oAl | S:$sCal/$sAbe/$sAppr/$sAl | res=$result"
    Add-Content $logFile $line
    Write-Host $line

    if ($status -and $status.phase -eq "COMPLETE") { break }
    Start-Sleep -Seconds 120
}
