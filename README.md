# Astro Pipeline — Autonomous PixInsight Preprocessing

Autonomous preprocessing pipeline for deep-sky astrophotography, running natively inside **PixInsight** via PJSR (JavaScript). Controlled by Claude Code through the [pixinsight-mcp](https://github.com/aescaffre/pixinsight-mcp) MCP server.

## Overview

From raw FITS/XISF files to fully calibrated, aligned, integrated stacks (normal + Drizzle 2×) — entirely hands-free. No manual steps between phases.

```
Raw FITS/XISF
    ↓ Phase 1 : Calibration       (Bias + Dark + Flat — auto DOF matching)
    ↓ Phase 2 : ABE deg 1         (per-frame background gradient removal)
    ↓ Phase 3 : SubframeSelector  (MAD+IQR scoring + inter-night analysis)
    ↓ Phase 4 : StarAlignment     (best image as reference + Drizzle data)
    ↓ Phase 5 : ImageIntegration  (weighted average + sigma clipping)
    ↓ Phase 6 : DrizzleIntegration 2× (sub-pixel super-resolution)
Output: {filter}_integration.xisf + {filter}_drizzle_2x.xisf
```

## Architecture

This pipeline is part of a three-tier autonomous processing system:

```
Claude Code (AI driver)
    ↕  MCP protocol
pixinsight-mcp  (Node.js + TypeScript MCP server)
    ↕  file-based IPC
PixInsight PJSR watcher  (executes PJSR scripts)
    ↕  executeGlobal()
astro-pipeline  ← THIS REPO
    (pipeline.js runs inside PixInsight)
```

- **[pixinsight-mcp](https://github.com/aescaffre/pixinsight-mcp)** — MCP server bridging Claude Code and PixInsight. Handles post-processing (color calibration, stretch, denoising, etc.)
- **astro-pipeline** — PJSR preprocessing scripts. Handles calibration through stacking.

## Requirements

- [PixInsight](https://pixinsight.com/) 1.8.9+
- [pixinsight-mcp](https://github.com/aescaffre/pixinsight-mcp) running (for Claude Code control)
- Claude Code with the `run_script` MCP tool available

## File Structure

```
astro-pipeline/
├── pipeline_v130.js     # Active pipeline (v1.5.0)
├── run_session.js       # Generic launcher — edit ROOTDIR only
├── README.md
├── check_cal.ps1        # PowerShell: check calibrated file count
├── check_new.ps1        # PowerShell: detect new output files
├── check_progress.ps1   # PowerShell: read pipeline_status.json
├── list_results.ps1     # PowerShell: list result files with sizes
├── monitor.ps1          # PowerShell: single progress snapshot
├── monitor_loop.ps1     # PowerShell: live progress loop
├── read_log.ps1         # PowerShell: tail pipeline console log
├── scan_dof.ps1         # PowerShell: scan DOF master files
├── scan_rosette.ps1     # PowerShell: scan raw frames
└── write_log.ps1        # PowerShell: write to pipeline log
```

### Launcher pattern

Edit `run_session.js` — change only `ROOTDIR`, everything else is auto:

```javascript
// run_session.js — only line to change:
var ROOTDIR = "C:/MyObject";
```

**Launch from PixInsight console:**
```javascript
eval(File.readTextFile("C:/astro-pipeline/run_session.js"))
```

**Launch via Claude Code (MCP):**
```javascript
eval(File.readTextFile("C:/astro-pipeline/run_session.js"))
```

> ⚠️ Never paste pipeline code inline into the PixInsight console — silent transcription errors will occur. Always use `eval(File.readTextFile(...))`.

## Input Folder Structure

```
C:/MyObject/
├── B/
│   ├── MyObject_LIGHT_B_2025-05-28_04-34-46_-9.70_180.00s_FWHM4.44_ex0.34_0000.fit
│   └── ...
├── R/
│   └── ...
└── V/    ← folder named V with files named LIGHT_G = same filter (naming alias)
    └── ...
```

Filename convention (NINA/SGP): `Object_LIGHT_Filter_YYYY-MM-DD_HH-MM-SS_Temp_Exps_FWHMx_exx_Index.fit`

## DOF Master Structure

```
dofDir/
├── MasterBias/
│   └── MasterSuperBias-0-ARO.xisf
├── MasterDarks/
│   └── MasterDark-ARO-180-10.xisf      (180s exposure, -10°C)
└── MasterFlats/
    ├── MasterFlat_B_ARO-10.xisf
    ├── MasterFlat_G_ARO-10.xisf        (used for both G and V filters)
    └── MasterFlat_R_ARO-10.xisf
```

DOF matching is fully automatic: temperature and exposure time are parsed from filenames.
Filter aliases: `V → G`, `C → L` (configurable in `findDOFMasters()`).

## Configuration Reference

All parameters with their defaults (from `run_session.js`):

```javascript
var CONFIG = {
  // Paths
  rootDir:            "C:/MyObject",          // folder with filter subfolders
  dofDir:             "D:/ARO/PIX",           // DOF masters root
  resultDir:          "C:/MyObject/result",

  // Filters (null = auto-detect from subfolders B/G/R/L/H/S/O/V)
  filters:            null,

  // Phase toggles (all true by default)
  doCalibration:      true,
  doABE:              true,
  doSubframe:         true,
  doAlign:            true,
  doIntegration:      true,
  doDrizzle:          true,

  // ImageIntegration sigma clipping
  sigmaLow:           4.0,    // used only if autoSigma = false
  sigmaHigh:          3.0,

  // AutoSigma — coordinate descent to find optimal sigma pair
  autoSigma:          true,
  autoSigmaHighRange: [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0],
  autoSigmaLowRange:  [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5],

  // Drizzle
  drizzleScale:       2.0,
  drizzleDropShrink:  0.90,

  // SubframeSelector MAD+IQR rejection weights
  wSNR:               1.0,   // SNR weight
  wFWHM:              1.2,   // FWHM weight (resolution impact — highest)
  wStars:             1.0,   // star count weight
  wNoise:             0.8,   // sky background proxy (0 = disabled)
  iqrMult:            1.5,   // rejection threshold: Q3 + iqrMult * IQR
  noiseColIdx:        10,    // SubframeSelector column index for Noise
  debugColumns:       false, // set true once to confirm noiseColIdx

  // Inter-night analysis
  rejectBadNights:    true,  // reject entire degraded nights automatically
  nightIqrMult:       1.5,
  minNightSize:       3,     // min images per night to be analyzed

  // Camera/optics
  subframeScale:      1.84,  // arcsec/pixel (ARO default)

  // StarAlignment reference filter (H > R > first detected)
  preferredRefFilter: "H",
};
```

## Image Selection Algorithm (MAD+IQR)

The pipeline uses a robust **MAD+IQR** scoring algorithm — no fixed thresholds, fully adaptive to each session's statistics.

### Individual image scoring

1. **Median** of FWHM, SNR, Stars (and Noise in v1.3.0) across all images
2. **MAD** (Median Absolute Deviation) — robust dispersion, outlier-resistant
3. **Degradation z-scores** (positive only when image is *worse* than median):
   - `z_FWHM  = max(0, (FWHM - median_FWHM) / MAD_FWHM)`   — bloated PSF
   - `z_SNR   = max(0, (median_SNR - SNR) / MAD_SNR)`       — low signal
   - `z_Stars = max(0, (median_Stars - Stars) / MAD_Stars)`  — cloud/vignette
   - `z_Noise = max(0, (Noise - median_Noise) / MAD_Noise)`  — bright sky (v1.3.0)
4. **Cumulation bonus**: +1 if ≥2 criteria have z>1, +1 more if all 3+ degraded simultaneously
5. **Score** = `wFWHM×z_FWHM + wSNR×z_SNR + wStars×z_Stars + [wNoise×z_Noise] + bonus`
6. **Threshold** = Q3 + 1.5×IQR on score distribution → only statistical outliers rejected

### Inter-night analysis (v1.3.0)

On multi-night sessions, the same MAD+IQR is applied to **per-night medians**. Entire nights that are statistically worse than the rest are rejected before individual scoring runs. Requires ≥2 nights with ≥3 images each.

### Image weighting (SSWEIGHT)

Approved images receive a weight for integration:
```
SSWEIGHT = 15×(1−FWHM_norm) + 15×(1−Eccentricity_norm) + 20×SNR_norm + 50
```
Score range: 50–100. Written as a FITS keyword, used by ImageIntegration (`KeywordWeight` mode). The image with the highest SSWEIGHT is used as the StarAlignment reference.

## Resume / Fault Tolerance

Each phase checks if output files already exist (≥90% threshold). If so, the phase is skipped automatically. This allows:
- Resuming after a crash or MCP timeout
- Re-running with different parameters for later phases only
- Monitoring progress via `pipeline_status.json` (updated after each sub-step)

## Output Files

```
result/
├── pipeline_status.json      ← real-time progress (phase, timestamp)
├── pipeline_report.json      ← final report (filters, paths, reference image)
├── best_B.json               ← best B image + MAD+IQR stats + rejection log
├── best_R.json
├── best_V.json
├── B_integration.xisf        ← normal stack (~100 MB per filter)
├── R_integration.xisf
├── V_integration.xisf
├── B_drizzle_2x.xisf         ← Drizzle 2× stack (~400 MB per filter)
├── R_drizzle_2x.xisf
└── V_drizzle_2x.xisf

{filter}/calibrated/
├── *_c.xisf                  ← calibrated frames
├── *_c_abe.xisf              ← calibrated + background corrected
├── *_c_abe_a.xisf            ← approved + SSWEIGHT keyword
├── *_c_abe_a_r.xisf          ← aligned
└── *_c_abe_a_r.xdrz          ← Drizzle data
```

## Known PJSR Gotchas

Issues encountered and documented during development:

| Issue | Symptom | Fix |
|---|---|---|
| `StarAlignment.targets` with `isFile=false` | 0 output files, no error | Always use `[true, true, path]` |
| `sa.mode = StarAlignment.prototype.Always` | "batch tasks can only work in RegisterMatch mode" | Use `sa.intersection = StarAlignment.prototype.Always` instead |
| `for...in` on StarAlignment | PixInsight access violation crash | Use `toSource()` only |
| `ImageCalibration.inputFiles` | Does nothing | Use `ic.targetFrames = [[true, path], ...]` |
| Inline code in console | Silent transcription errors | Always use `eval(File.readTextFile(...))` |
| ABE background model windows | Extra windows accumulate in PixInsight | Capture window list before `executeOn()`, close all new windows after |

## License

MIT — Astro ARO

## Related

- **[pixinsight-mcp](https://github.com/aescaffre/pixinsight-mcp)** — MCP server for Claude Code ↔ PixInsight bridge (post-processing pipeline, MCP tools, web editor)
