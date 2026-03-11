$out = @()

$out += "=================================================================="
$out += " RAPPORT COMPLET DE PRE-TRAITEMENT — ROSETTE SHO"
$out += " Pipeline v1.4.0 — PixInsight PJSR"
$out += " Date : 11/03/2026"
$out += "=================================================================="
$out += ""

# Status final
$status = Get-Content 'D:/Rosette/result/pipeline_status.json' | ConvertFrom-Json
$report = Get-Content 'D:/Rosette/result/pipeline_report.json' | ConvertFrom-Json
$out += "-- RESUME SESSION ---------------------------------------------------"
$out += "  rootDir    : D:/Rosette"
$out += "  dofDir     : D:/Terrapixa Dropbox/clement ver eecke/ARO/PIX"
$out += "  arcsec/px  : 1.84"
$out += "  Filtres    : H (98 bruts), O (57 bruts), S (80 bruts)"
$out += "  Total bruts: 235"
$out += "  Approuves  : 217 (92%)"
$out += "  Reference  : $($report.reference)"
$out += "  Debut      : 2026-03-11 17:20:44 UTC"
$out += "  Fin        : $($status.ts) UTC"
$out += "  Duree      : ~2h30"
$out += ""

# PHASES
$out += "-- PHASES (timestamps UTC) ------------------------------------------"
$out += "  17:20:44  CALIBRATION STARTED"
$out += "  17:55:17  ABE STARTED  (calibration complete : H=98, O=57, S=80)"
$out += "  18:49:42  SUBFRAME STARTED  (ABE complete)"
$out += "  17:55:17  ALIGNMENT STARTED"
$out += "  19:51:34  ALIGNMENT EN COURS (H=96/96, O=16/52...)"
$out += "  20:08:43  INTEGRATION/SIGMA H STARTED"
$out += "  21:08:43  INTEGRATION H COMPLETE"
$out += "  21:10:29  H_integration.xisf sauvegarde"
$out += "  21:21:20  INTEGRATION O COMPLETE"
$out += "  21:22:17  O_integration.xisf sauvegarde"
$out += "  21:37:04  INTEGRATION S COMPLETE"
$out += "  21:38:20  S_integration.xisf sauvegarde"
$out += "  21:43:21  H_drizzle_2x.xisf sauvegarde (398 Mo)"
$out += "  21:45:49  O_drizzle_2x.xisf sauvegarde (398 Mo)"
$out += "  21:48:47  S_drizzle_2x.xisf sauvegarde (398 Mo)"
$out += "  21:48:47  COMPLETE — ALL_DONE"
$out += ""

# SUBFRAME H
$bH = Get-Content 'D:/Rosette/result/best_H.json' | ConvertFrom-Json
$out += "-- SUBFRAMESELECTOR : FILTRE H --------------------------------------"
$out += "  Total    : $($bH.stats.total) images"
$out += "  Approuves: $($bH.stats.approved)"
$out += "  Rejetes  : $($bH.stats.rejected)"
$out += "  Algo     : $($bH.algorithm)"
$out += "  FWHM     : med=$([math]::Round($bH.stats.fwhm.med,3))''  MAD=$([math]::Round($bH.stats.fwhm.mad,3))''  [min=$([math]::Round($bH.stats.fwhm.min,2))'' max=$([math]::Round($bH.stats.fwhm.max,2))'']"
$out += "  SNR      : med=$([math]::Round($bH.stats.snr.med,4))  MAD=$([math]::Round($bH.stats.snr.mad,4))"
$out += "  Stars    : med=$([int]$bH.stats.stars.med)  MAD=$([int]$bH.stats.stars.mad)"
$out += "  BEST     : $([System.IO.Path]::GetFileName($bH.path))"
$out += "  SSWEIGHT : $([math]::Round($bH.ssw,2))"
$out += ""
$out += "  REJECTIONS H :"
foreach ($r in $bH.rejectionLog) {
    $out += "    [-] $($r.file)"
    $out += "        score=$($r.score) | $($r.reasons -join ' | ')"
}
$out += ""

# SUBFRAME O
$bO = Get-Content 'D:/Rosette/result/best_O.json' | ConvertFrom-Json
$out += "-- SUBFRAMESELECTOR : FILTRE O --------------------------------------"
$out += "  Total    : $($bO.stats.total) images"
$out += "  Approuves: $($bO.stats.approved)"
$out += "  Rejetes  : $($bO.stats.rejected)"
$out += "  Algo     : $($bO.algorithm)"
$out += "  FWHM     : med=$([math]::Round($bO.stats.fwhm.med,3))''  MAD=$([math]::Round($bO.stats.fwhm.mad,3))''  [min=$([math]::Round($bO.stats.fwhm.min,2))'' max=$([math]::Round($bO.stats.fwhm.max,2))'']"
$out += "  SNR      : med=$([math]::Round($bO.stats.snr.med,4))  MAD=$([math]::Round($bO.stats.snr.mad,4))"
$out += "  Stars    : med=$([int]$bO.stats.stars.med)  MAD=$([int]$bO.stats.stars.mad)"
$out += "  BEST     : $([System.IO.Path]::GetFileName($bO.path))"
$out += "  SSWEIGHT : $([math]::Round($bO.ssw,2))"
$out += ""
$out += "  REJECTIONS O :"
foreach ($r in $bO.rejectionLog) {
    $out += "    [-] $($r.file)"
    $out += "        score=$($r.score) | $($r.reasons -join ' | ')"
}
$out += ""

# SUBFRAME S
$bS = Get-Content 'D:/Rosette/result/best_S.json' | ConvertFrom-Json
$out += "-- SUBFRAMESELECTOR : FILTRE S --------------------------------------"
$out += "  Total    : $($bS.stats.total) images"
$out += "  Approuves: $($bS.stats.approved)"
$out += "  Rejetes  : $($bS.stats.rejected)"
$out += "  Algo     : $($bS.algorithm)"
$out += "  FWHM     : med=$([math]::Round($bS.stats.fwhm.med,3))''  MAD=$([math]::Round($bS.stats.fwhm.mad,3))''  [min=$([math]::Round($bS.stats.fwhm.min,2))'' max=$([math]::Round($bS.stats.fwhm.max,2))'']"
$out += "  SNR      : med=$([math]::Round($bS.stats.snr.med,4))  MAD=$([math]::Round($bS.stats.snr.mad,4))"
$out += "  Stars    : med=$([int]$bS.stats.stars.med)  MAD=$([int]$bS.stats.stars.mad)"
$out += "  BEST     : $([System.IO.Path]::GetFileName($bS.path))"
$out += "  SSWEIGHT : $([math]::Round($bS.ssw,2))"
$out += ""
$out += "  REJECTIONS S :"
foreach ($r in $bS.rejectionLog) {
    $out += "    [-] $($r.file)"
    $out += "        score=$($r.score) | $($r.reasons -join ' | ')"
}
$out += ""

# SIGMA SEARCH
foreach ($f in @("H","O","S")) {
    $sg = Get-Content "D:/Rosette/result/${f}_sigma_search.json" | ConvertFrom-Json
    $out += "-- AUTO-SIGMA (coordinate descent MAD) : FILTRE $f ----------------"
    $out += "  Images    : $($sg.nImages)"
    $out += "  Algo      : $($sg.algorithm)"
    $out += "  Timestamp : $($sg.ts)"
    $out += ""
    $out += "  Phase A — sweep sigmaHigh (sigmaLow fixe = $($sg.sigmaLow_init)) :"
    $out += "  " + ("{0,-12}{1,-12}{2,-14}" -f "sigmaHigh","sigmaLow","MAD")
    $out += "  " + ("-" * 38)
    foreach ($s in $sg.sweepHigh) {
        $mark = if ($s.sigmaHigh -eq $sg.bestSigmaHigh) { " <-- BEST" } else { "" }
        $out += "  " + ("{0,-12}{1,-12}{2,-14}" -f $s.sigmaHigh, $s.sigmaLow, ("{0:E4}" -f $s.mad)) + $mark
    }
    $out += ""
    $out += "  Phase B — sweep sigmaLow (sigmaHigh fixe = $($sg.bestSigmaHigh)) :"
    $out += "  " + ("{0,-12}{1,-12}{2,-14}" -f "sigmaHigh","sigmaLow","MAD")
    $out += "  " + ("-" * 38)
    foreach ($s in $sg.sweepLow) {
        $mark = if ($s.sigmaLow -eq $sg.bestSigmaLow) { " <-- BEST" } else { "" }
        $out += "  " + ("{0,-12}{1,-12}{2,-14}" -f $s.sigmaHigh, $s.sigmaLow, ("{0:E4}" -f $s.mad)) + $mark
    }
    $out += ""
    $out += "  => sigmaHigh optimal : $($sg.bestSigmaHigh)"
    $out += "  => sigmaLow  optimal : $($sg.bestSigmaLow)"
    $out += "  => MAD final         : $($sg.bestMAD_Low)"
    $out += ""
}

# FICHIERS PRODUITS
$out += "-- FICHIERS PRODUITS ------------------------------------------------"
Get-ChildItem 'D:/Rosette/result' -Filter '*.xisf' | ForEach-Object {
    $mo = [math]::Round($_.Length / 1MB, 0)
    $out += "  $($_.Name.PadRight(35)) $mo Mo   [$($_.LastWriteTime.ToString('HH:mm:ss'))]"
}
$out += ""
$out += "=================================================================="
$out += " FIN DU RAPPORT"
$out += "=================================================================="

$out | Out-File -FilePath 'D:/Rosette/result/pipeline_log_complet.txt' -Encoding UTF8
Write-Host "Log ecrit : D:/Rosette/result/pipeline_log_complet.txt"
Write-Host "Lignes : $($out.Count)"
