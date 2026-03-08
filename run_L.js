// ============================================================
// ASTRO PIPELINE - Autonomous PixInsight Preprocessing
// Version: 1.0.0
// ============================================================
//
// USAGE: Ouvrir PixInsight > Script > Run Script > pipeline.js
//   Ou via Claude Code (run_script MCP)
//
// Le script s'arrête et reprend là où il en était (resume automatique).
// Rapport final dans CONFIG.resultDir/pipeline_report.json
//
// ============================================================
// CONFIGURATION - À ADAPTER PAR SESSION
// ============================================================

var CONFIG = {
  rootDir:           "D:/Gost",
  dofDir:            "D:/Terrapixa Dropbox/clement ver eecke/ARO/PIX",
  resultDir:         "D:/Gost/L/result",

  // Filtres à traiter (null = auto-détection depuis les sous-dossiers)
  filters:           ["L"],

  // Activation des phases
  doCalibration:     true,
  doABE:             true,
  doSubframe:        true,
  doAlign:           true,
  doIntegration:     true,
  doDrizzle:         true,

  // ImageIntegration - SigmaClip
  sigmaLow:          4.0,
  sigmaHigh:         3.0,

  // DrizzleIntegration
  drizzleScale:      2.0,
  drizzleDropShrink: 0.90,

  // SubframeSelector - seuils automatiques (percentiles)
  // Stars  : rejette en dessous de P_stars  (ex: P10 = rejette les 10% moins étoilées)
  // FWHM   : rejette au dessus de P_fwhm   (ex: P90 = rejette les 10% plus floues)
  // SNRWeight: rejette en dessous de P_snr (ex: P10 = rejette les 10% plus bruitées)
  pStars:            10,
  pFWHM:             90,
  pSNR:              10,

  // Subframe scale (arcsec/px - dépend de la caméra/optique)
  subframeScale:     2.26,

  // Filtre préféré pour la référence StarAlignment
  preferredRefFilter: "L",
};

// ============================================================
// UTILITAIRES
// ============================================================

function writeStatus(phase, msg, extra) {
  var obj = { phase: phase, msg: msg, ts: (new Date()).toISOString() };
  if (extra) {
    for (var k in extra) { obj[k] = extra[k]; }
  }
  var f = new File();
  f.create(CONFIG.resultDir + "/pipeline_status.json");
  f.outTextLn(JSON.stringify(obj));
  f.close();
  console.writeln("[" + phase + "] " + msg);
}

function ensureDir(path) {
  if (!File.directoryExists(path)) {
    File.createDirectory(path, true);
  }
}

function fileExists(path) {
  return File.exists(path);
}

function findFiles(dir, pattern) {
  var files = [];
  var ff = new FileFind();
  if (ff.begin(dir + "/" + pattern)) {
    do {
      if (ff.name !== "." && ff.name !== "..") {
        files.push(dir + "/" + ff.name);
      }
    } while (ff.next());
  }
  files.sort();
  return files;
}

function searchRecursive(dir, pattern) {
  var results = [];
  var ff = new FileFind();
  if (ff.begin(dir + "/" + pattern)) {
    do {
      if (ff.name !== "." && ff.name !== "..") {
        results.push(dir + "/" + ff.name);
      }
    } while (ff.next());
  }
  var ff2 = new FileFind();
  if (ff2.begin(dir + "/*")) {
    do {
      if (ff2.name !== "." && ff2.name !== ".." && ff2.isDirectory) {
        var sub = searchRecursive(dir + "/" + ff2.name, pattern);
        results = results.concat(sub);
      }
    } while (ff2.next());
  }
  return results;
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  var sorted = arr.slice().sort(function(a, b) { return a - b; });
  var idx = (p / 100) * (sorted.length - 1);
  var lo = Math.floor(idx);
  var hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function readJSON(path) {
  if (!fileExists(path)) return null;
  try {
    var f = new File();
    f.open(path, FileMode_Read);
    var content = "";
    while (!f.eof) content += f.readLine() + "\n";
    f.close();
    return JSON.parse(content);
  } catch(e) {
    return null;
  }
}

function writeJSON(path, obj) {
  var f = new File();
  f.create(path);
  f.outTextLn(JSON.stringify(obj, null, 2));
  f.close();
}

function closeAllWindows() {
  var wins = ImageWindow.windows;
  for (var w = wins.length - 1; w >= 0; w--) {
    wins[w].forceClose();
  }
}

// ============================================================
// PHASE 0 : Détection des filtres
// ============================================================

function detectFilters() {
  var known = ["B", "G", "R", "L", "H", "S", "O"];
  var detected = [];
  var ff = new FileFind();
  if (ff.begin(CONFIG.rootDir + "/*")) {
    do {
      if (ff.name !== "." && ff.name !== ".." && ff.isDirectory) {
        if (known.indexOf(ff.name) >= 0) {
          detected.push(ff.name);
        }
      }
    } while (ff.next());
  }
  detected.sort();
  return detected;
}

// ============================================================
// PHASE 1 : Matching DOF automatique
// ============================================================

function parseTempFromFilename(fname) {
  // Format: Object_LIGHT_Filter_YYYY-MM-DD_HH-MM-SS_TEMP_EXPs_...
  var parts = File.extractName(fname).split("_");
  if (parts.length >= 6) {
    var t = parseFloat(parts[5]);
    if (!isNaN(t)) return t;
  }
  return 0;
}

function parseExpFromFilename(fname) {
  var m = File.extractName(fname).match(/(\d+\.?\d*)s/);
  if (m) return parseFloat(m[1]);
  return 180;
}

function findDOFMasters(filter, temp, expTime) {
  var dof = { bias: null, dark: null, flat: null };
  var tempRounded = Math.round(temp);
  var expInt = Math.round(expTime);

  // SuperBias
  var biasFiles = searchRecursive(CONFIG.dofDir, "SuperBias*.xisf");
  var biasByTemp = biasFiles.filter(function(f) {
    return f.indexOf("-" + tempRounded + ".") >= 0 ||
           f.indexOf("-" + tempRounded + "_") >= 0;
  });
  if (biasByTemp.length > 0) {
    dof.bias = biasByTemp[0];
  } else if (biasFiles.length > 0) {
    // Fallback: take first SuperBias found
    dof.bias = biasFiles[0];
  }

  // Dark
  var darkFiles = searchRecursive(CONFIG.dofDir, "Dark*.xisf");
  var darkPatterns = [
    "Dark-" + expInt + "-" + tempRounded,
    "Dark-" + expInt + "-0",
    "Dark-" + expInt,
  ];
  for (var dp = 0; dp < darkPatterns.length; dp++) {
    for (var df = 0; df < darkFiles.length; df++) {
      if (darkFiles[df].indexOf(darkPatterns[dp]) >= 0) {
        dof.dark = darkFiles[df];
        break;
      }
    }
    if (dof.dark) break;
  }

  // Flat
  var flatFiles = searchRecursive(CONFIG.dofDir, "Flat_" + filter + "_ARO*.xisf");
  if (flatFiles.length === 0) {
    flatFiles = searchRecursive(CONFIG.dofDir, "Flat_" + filter + "*.xisf");
  }
  if (flatFiles.length > 0) dof.flat = flatFiles[0];

  console.writeln("  DOF " + filter + ": bias=" + (dof.bias ? File.extractName(dof.bias) : "NONE") +
    " | dark=" + (dof.dark ? File.extractName(dof.dark) : "NONE") +
    " | flat=" + (dof.flat ? File.extractName(dof.flat) : "NONE"));

  return dof;
}

// ============================================================
// PHASE 2 : Calibration
// ============================================================

function runCalibration(filter) {
  var srcDir = CONFIG.rootDir + "/" + filter;
  var calDir = srcDir + "/calibrated";
  ensureDir(calDir);

  // Chercher les bruts (pas déjà calibrés)
  var rawFiles = [];
  var exts = ["*.fit", "*.fits", "*.FIT", "*.FITS"];
  for (var e = 0; e < exts.length; e++) {
    var ff = new FileFind();
    if (ff.begin(srcDir + "/" + exts[e])) {
      do {
        if (ff.name !== "." && ff.name !== ".." &&
            ff.name.indexOf("_c.") < 0 && ff.name.indexOf("_c_") < 0) {
          rawFiles.push(srcDir + "/" + ff.name);
        }
      } while (ff.next());
    }
  }
  // Also check .xisf raws
  var ff2 = new FileFind();
  if (ff2.begin(srcDir + "/*.xisf")) {
    do {
      if (ff2.name !== "." && ff2.name !== ".." &&
          ff2.name.indexOf("_c.") < 0 && ff2.name.indexOf("_c_") < 0) {
        rawFiles.push(srcDir + "/" + ff2.name);
      }
    } while (ff2.next());
  }
  rawFiles.sort();

  if (rawFiles.length === 0) {
    console.writeln("  [" + filter + "] No raw files - skipping calibration");
    return 0;
  }

  // Resume: skip if already done
  var existing = findFiles(calDir, "*_c.xisf");
  if (existing.length >= rawFiles.length * 0.9) {
    console.writeln("  [" + filter + "] Calibration already done (" + existing.length + " files)");
    return existing.length;
  }

  // DOF matching
  var temp = parseTempFromFilename(rawFiles[0]);
  var expTime = parseExpFromFilename(rawFiles[0]);
  var dof = findDOFMasters(filter, temp, expTime);

  var ic = new ImageCalibration();
  ic.inputFiles = rawFiles;
  ic.outputDirectory = calDir;
  ic.outputExtension = ".xisf";
  ic.outputPostfix = "_c";
  ic.overwriteExistingFiles = false;
  ic.onError = ImageCalibration.prototype.Continue;

  ic.masterBiasEnabled = (dof.bias !== null);
  if (dof.bias) ic.masterBiasPath = dof.bias;

  ic.masterDarkEnabled = (dof.dark !== null);
  if (dof.dark) { ic.masterDarkPath = dof.dark; ic.optimizeDarks = true; }

  ic.masterFlatEnabled = (dof.flat !== null);
  if (dof.flat) ic.masterFlatPath = dof.flat;

  ic.executeGlobal();

  var count = findFiles(calDir, "*_c.xisf").length;
  console.writeln("  [" + filter + "] Calibrated: " + count + "/" + rawFiles.length);
  return count;
}

// ============================================================
// PHASE 3 : ABE deg 1
// ============================================================

function runABE(filter) {
  var calDir = CONFIG.rootDir + "/" + filter + "/calibrated";

  // Collecter les _c.xisf et _c.fit
  var calFiles = [];
  var p1 = findFiles(calDir, "*_c.xisf");
  var p2 = findFiles(calDir, "*_c.fit");
  calFiles = p1.concat(p2);
  calFiles.sort();

  if (calFiles.length === 0) {
    console.writeln("  [" + filter + "] No calibrated files for ABE");
    return 0;
  }

  // Resume
  var existing = findFiles(calDir, "*_c_abe.xisf");
  if (existing.length >= calFiles.length * 0.9) {
    console.writeln("  [" + filter + "] ABE already done (" + existing.length + " files)");
    return existing.length;
  }

  var processed = 0;
  for (var i = 0; i < calFiles.length; i++) {
    var inPath = calFiles[i];
    var baseName = File.extractName(inPath).replace(/\.(xisf|fit|fits)$/i, "");
    var outPath = calDir + "/" + baseName + "_abe.xisf";

    if (fileExists(outPath)) { processed++; continue; }

    var wins = ImageWindow.open(inPath);
    if (!wins || wins.length === 0) continue;
    var win = wins[0];

    var abe = new AutomaticBackgroundExtractor();
    abe.degree = 1;
    abe.tolerance = 1.0;
    abe.deviation = 0.800;
    abe.unifiedModel = false;
    abe.targetBackground = 0.05;
    abe.correctionFactor = 1.00;
    abe.smoothing = 0.50;
    abe.useRoiOrPreview = false;
    abe.samplesPerRow = 20;
    abe.correctOnlyEnabled = true;
    abe.executeOn(win.mainView);

    win.saveAs(outPath, false, false, false, false);
    win.forceClose();
    processed++;

    if (processed % 10 === 0) {
      writeStatus("ABE_" + filter, "RUNNING", { done: processed, total: calFiles.length });
    }
  }

  console.writeln("  [" + filter + "] ABE done: " + processed + "/" + calFiles.length);
  return processed;
}

// ============================================================
// PHASE 4 : SubframeSelector + Auto-seuils + SSWEIGHT
// ============================================================

function runSubframeAndSSWEIGHT(filter) {
  var calDir = CONFIG.rootDir + "/" + filter + "/calibrated";
  var abeFiles = findFiles(calDir, "*_c_abe.xisf");

  if (abeFiles.length === 0) {
    console.writeln("  [" + filter + "] No ABE files for SubframeSelector");
    return [];
  }

  // Resume
  var existingA = findFiles(calDir, "*_c_abe_a.xisf");
  if (existingA.length >= abeFiles.length * 0.9) {
    console.writeln("  [" + filter + "] SSWEIGHT already done (" + existingA.length + " files)");
    return existingA;
  }

  // --- SubframeSelector: mesurer seulement ---
  var sfs = new SubframeSelector();
  sfs.routine = SubframeSelector.prototype.MeasureSubframes;
  sfs.subframeScale = CONFIG.subframeScale;
  sfs.scaleUnit = SubframeSelector.prototype.ArcSeconds;
  sfs.dataUnit = SubframeSelector.prototype.Electron;
  sfs.fileCache = true;
  sfs.trimmingFactor = 0.10;
  sfs.structureLayers = 5;
  sfs.noiseLayers = 0;
  sfs.hotPixelFilterRadius = 1;
  sfs.noiseReductionFilterRadius = 0;
  sfs.sensitivity = 0.50;
  sfs.peakResponse = 0.80;
  sfs.brightThreshold = 3.00;
  sfs.maxDistortion = 0.50;
  sfs.upperLimit = 1.00;
  sfs.approvalExpression = "FWHM <= 99 && SNRWeight >= 0";
  sfs.weightingExpression = "(15*(1-(FWHM-FWHMMin)/(FWHMMax-FWHMMin)) + 15*(1-(Eccentricity-EccentricityMin)/(EccentricityMax-EccentricityMin)) + 20*(SNRWeight-SNRWeightMin)/(SNRWeightMax-SNRWeightMin))+50";

  var subframes = [];
  for (var i = 0; i < abeFiles.length; i++) {
    subframes.push([true, abeFiles[i]]);
  }
  sfs.subframes = subframes;
  sfs.outputDirectory = calDir;
  sfs.outputKeyword = "SSWEIGHT";
  sfs.overwriteExistingFiles = false;
  sfs.onError = SubframeSelector.prototype.Continue;
  sfs.executeGlobal();

  // --- Extraction des mesures ---
  var measurements = sfs.measurements;
  // Colonnes: 3=path, 5=FWHM, 6=Eccentricity, 7=SNRWeight, 14=Stars
  var data = [];
  var fwhmArr = [], snrArr = [], starsArr = [], eccArr = [];

  for (var m = 0; m < measurements.length; m++) {
    var row = measurements[m];
    var path = row[3];
    var fwhm = row[5];
    var ecc  = row[6];
    var snr  = row[7];
    var stars = row[14];
    if (fwhm > 0 && snr > 0) {
      data.push({ path: path, fwhm: fwhm, ecc: ecc, snr: snr, stars: stars });
      fwhmArr.push(fwhm);
      snrArr.push(snr);
      starsArr.push(stars);
      eccArr.push(ecc);
    }
  }

  if (data.length === 0) {
    console.writeln("  [" + filter + "] WARNING: No measurements returned");
    return [];
  }

  // --- Auto-seuils percentiles ---
  var fwhmThresh  = percentile(fwhmArr,  CONFIG.pFWHM);
  var snrThresh   = percentile(snrArr,   CONFIG.pSNR);
  var starsThresh = percentile(starsArr, CONFIG.pStars);

  console.writeln("  [" + filter + "] Auto-seuils: FWHM<=" + fwhmThresh.toFixed(2) +
    "\" | SNR>=" + snrThresh.toFixed(2) + " | Stars>=" + Math.round(starsThresh));
  console.writeln("  [" + filter + "] Métriques: FWHM[" +
    Math.min.apply(null,fwhmArr).toFixed(2) + "-" + Math.max.apply(null,fwhmArr).toFixed(2) + "] | SNR[" +
    Math.min.apply(null,snrArr).toFixed(2) + "-" + Math.max.apply(null,snrArr).toFixed(2) + "] | Stars[" +
    Math.round(Math.min.apply(null,starsArr)) + "-" + Math.round(Math.max.apply(null,starsArr)) + "]");

  // --- Approbation ---
  var approved = data.filter(function(d) {
    return d.fwhm <= fwhmThresh && d.snr >= snrThresh && d.stars >= starsThresh;
  });
  var rejected = data.length - approved.length;
  console.writeln("  [" + filter + "] Approuvés: " + approved.length + "/" + data.length + " (rejetés: " + rejected + ")");

  if (approved.length === 0) {
    console.writeln("  [" + filter + "] ERREUR: aucun fichier approuvé - vérifier les paramètres");
    return [];
  }

  // --- Calcul SSWEIGHT (sur set approuvé uniquement) ---
  var apFWHM  = approved.map(function(d) { return d.fwhm; });
  var apEcc   = approved.map(function(d) { return d.ecc;  });
  var apSNR   = approved.map(function(d) { return d.snr;  });

  var FWHMMin = Math.min.apply(null, apFWHM);
  var FWHMMax = Math.max.apply(null, apFWHM);
  var EccMin  = Math.min.apply(null, apEcc);
  var EccMax  = Math.max.apply(null, apEcc);
  var SNRMin  = Math.min.apply(null, apSNR);
  var SNRMax  = Math.max.apply(null, apSNR);

  var bestSSW = -1, bestPath = null;
  var outputFiles = [];

  for (var a = 0; a < approved.length; a++) {
    var img = approved[a];
    var fDiff = (FWHMMax === FWHMMin) ? 0 : (img.fwhm - FWHMMin) / (FWHMMax - FWHMMin);
    var eDiff = (EccMax  === EccMin)  ? 0 : (img.ecc  - EccMin)  / (EccMax  - EccMin);
    var sDiff = (SNRMax  === SNRMin)  ? 0 : (img.snr  - SNRMin)  / (SNRMax  - SNRMin);
    var ssw = 15 * (1 - fDiff) + 15 * (1 - eDiff) + 20 * sDiff + 50;

    if (ssw > bestSSW) { bestSSW = ssw; bestPath = img.path; }

    // Chemin de sortie: _c_abe.xisf → _c_abe_a.xisf
    var outPath = img.path.replace(/_c_abe\.xisf$/i, "_c_abe_a.xisf");

    if (fileExists(outPath)) {
      outputFiles.push(outPath);
      continue;
    }

    // Ouvrir, ajouter SSWEIGHT, sauvegarder
    var wins = ImageWindow.open(img.path);
    if (!wins || wins.length === 0) continue;
    var win = wins[0];

    var kws = win.keywords;
    var newKws = [];
    for (var k = 0; k < kws.length; k++) {
      if (kws[k].name !== "SSWEIGHT") newKws.push(kws[k]);
    }
    newKws.push(new FITSKeyword("SSWEIGHT", ssw.toFixed(6), "Subframe weight"));
    win.keywords = newKws;
    win.saveAs(outPath, false, false, false, false);
    win.forceClose();
    outputFiles.push(outPath);

    if ((a + 1) % 10 === 0) {
      writeStatus("SSWEIGHT_" + filter, "RUNNING", { done: a + 1, total: approved.length });
    }
  }

  // Sauvegarder les infos de la meilleure image
  var bestInfo = {
    filter: filter,
    path: bestPath,
    ssw: bestSSW,
    thresholds: { fwhmMax: fwhmThresh, snrMin: snrThresh, starsMin: starsThresh },
    stats: {
      total: data.length, approved: approved.length, rejected: rejected,
      fwhm: { min: Math.min.apply(null,fwhmArr), max: Math.max.apply(null,fwhmArr) },
      snr:  { min: Math.min.apply(null,snrArr),  max: Math.max.apply(null,snrArr)  },
      stars:{ min: Math.round(Math.min.apply(null,starsArr)), max: Math.round(Math.max.apply(null,starsArr)) }
    }
  };
  writeJSON(CONFIG.resultDir + "/best_" + filter + ".json", bestInfo);

  console.writeln("  [" + filter + "] Best: " + (bestPath ? File.extractName(bestPath) : "N/A") +
    " SSWEIGHT=" + bestSSW.toFixed(2));
  return outputFiles;
}

// ============================================================
// PHASE 5 : StarAlignment (mode Intersection/Always)
// ============================================================

function runStarAlignment(allApprovedFiles, referenceFile) {
  // Resume: compter les _r.xisf existants
  var alreadyDone = 0;
  for (var i = 0; i < allApprovedFiles.length; i++) {
    if (fileExists(allApprovedFiles[i].replace("_c_abe_a.xisf", "_c_abe_a_r.xisf"))) {
      alreadyDone++;
    }
  }
  if (alreadyDone >= allApprovedFiles.length * 0.9) {
    console.writeln("StarAlignment already done (" + alreadyDone + " files)");
    return;
  }

  var targets = [];
  for (var i = 0; i < allApprovedFiles.length; i++) {
    targets.push([true, true, allApprovedFiles[i]]);
  }

  var sa = new StarAlignment();
  sa.referenceImage   = referenceFile;
  sa.referenceIsFile  = true;
  sa.structureLayers  = 5;
  sa.noiseLayers      = 0;
  sa.hotPixelFilterRadius = 1;
  sa.sensitivity      = 0.50;
  sa.peakResponse     = 0.50;
  sa.maxStarDistortion = 0.60;
  sa.matcherTolerance = 0.0500;
  sa.ransacTolerance  = 2.0;
  sa.maxStars         = 0;
  sa.intersection     = StarAlignment.prototype.Always;
  sa.generateDrizzleData = true;
  sa.pixelInterpolation = StarAlignment.prototype.Auto;
  sa.clampingThreshold = 0.30;
  sa.outputPostfix    = "_r";
  sa.outputDirectory  = "";
  sa.outputExtension  = ".xisf";
  sa.overwriteExistingFiles = false;
  sa.onError          = StarAlignment.prototype.Continue;
  sa.targets          = targets;

  sa.executeGlobal();
  console.writeln("StarAlignment complete");
}

// ============================================================
// PHASE 6 : ImageIntegration
// ============================================================

function runIntegration(filter) {
  var calDir = CONFIG.rootDir + "/" + filter + "/calibrated";
  var outPath = CONFIG.resultDir + "/" + filter + "_integration.xisf";

  if (fileExists(outPath)) {
    console.writeln("  [" + filter + "] Integration already done");
    return;
  }

  var alignedFiles = findFiles(calDir, "*_c_abe_a_r.xisf");
  if (alignedFiles.length === 0) {
    console.writeln("  [" + filter + "] No aligned files for integration");
    return;
  }

  var images = [];
  for (var i = 0; i < alignedFiles.length; i++) {
    var xdrzPath = alignedFiles[i].replace(".xisf", ".xdrz");
    images.push([true, alignedFiles[i], xdrzPath, ""]);
  }

  var ii = new ImageIntegration();
  ii.images               = images;
  ii.combination          = ImageIntegration.prototype.Average;
  ii.weightMode           = ImageIntegration.prototype.KeywordWeight;
  ii.weightKeyword        = "SSWEIGHT";
  ii.weightScale          = ImageIntegration.prototype.WeightScale_BWMV;
  ii.minWeight            = 0.005;
  ii.normalization        = ImageIntegration.prototype.AdditiveWithScaling;
  ii.rejection            = ImageIntegration.prototype.SigmaClip;
  ii.rejectionNormalization = ImageIntegration.prototype.Scale;
  ii.sigmaLow             = CONFIG.sigmaLow;
  ii.sigmaHigh            = CONFIG.sigmaHigh;
  ii.clipLow              = true;
  ii.clipHigh             = true;
  ii.generateDrizzleData  = true;
  ii.generateIntegratedImage = true;

  ii.executeGlobal();

  // Sauvegarder la fenêtre résultat
  var wins = ImageWindow.windows;
  for (var w = 0; w < wins.length; w++) {
    if (wins[w].mainView.id.toLowerCase().indexOf("integration") >= 0) {
      wins[w].saveAs(outPath, false, false, false, false);
      wins[w].forceClose();
      break;
    }
  }
  closeAllWindows();
  console.writeln("  [" + filter + "] Integration saved: " + outPath);
}

// ============================================================
// PHASE 7 : DrizzleIntegration 2×
// ============================================================

function runDrizzle(filter) {
  var calDir = CONFIG.rootDir + "/" + filter + "/calibrated";
  var outPath = CONFIG.resultDir + "/" + filter + "_drizzle_2x.xisf";

  if (fileExists(outPath)) {
    console.writeln("  [" + filter + "] Drizzle already done");
    return;
  }

  var xdrzFiles = findFiles(calDir, "*_c_abe_a_r.xdrz");
  if (xdrzFiles.length === 0) {
    console.writeln("  [" + filter + "] No .xdrz files for Drizzle");
    return;
  }

  var inputData = [];
  for (var i = 0; i < xdrzFiles.length; i++) {
    inputData.push([true, xdrzFiles[i], ""]);
  }

  var di = new DrizzleIntegration();
  di.inputData              = inputData;
  di.scale                  = CONFIG.drizzleScale;
  di.dropShrink             = CONFIG.drizzleDropShrink;
  di.kernelFunction         = DrizzleIntegration.prototype.Kernel_Square;
  di.enableRejection        = true;
  di.enableImageWeighting   = true;
  di.enableSurfaceSplines   = true;
  di.enableLocalDistortion  = true;
  di.enableLocalNormalization    = false;
  di.enableAdaptiveNormalization = false;
  di.onError                = DrizzleIntegration.prototype.Continue;

  di.executeGlobal();

  var wins = ImageWindow.windows;
  for (var w = 0; w < wins.length; w++) {
    var wid = wins[w].mainView.id.toLowerCase();
    if (wid.indexOf("drizzle") >= 0 || wid.indexOf("integration") >= 0) {
      wins[w].saveAs(outPath, false, false, false, false);
      wins[w].forceClose();
      break;
    }
  }
  closeAllWindows();
  console.writeln("  [" + filter + "] Drizzle saved: " + outPath);
}

// ============================================================
// MAIN
// ============================================================

function main() {
  ensureDir(CONFIG.resultDir);
  writeStatus("INIT", "STARTED", { version: "1.0.0", config: CONFIG });

  // ---- Détection des filtres ----
  var filters = CONFIG.filters || detectFilters();
  if (filters.length === 0) {
    writeStatus("ERROR", "NO_FILTERS_DETECTED");
    console.writeln("ERREUR: aucun sous-dossier de filtre trouvé dans " + CONFIG.rootDir);
    return;
  }
  console.writeln("Filtres: " + filters.join(", "));

  // ---- Phase 1: Calibration ----
  if (CONFIG.doCalibration) {
    writeStatus("CALIBRATION", "STARTED");
    for (var f = 0; f < filters.length; f++) {
      var n = runCalibration(filters[f]);
      writeStatus("CALIBRATION", "DONE_" + filters[f], { count: n });
    }
    writeStatus("CALIBRATION", "COMPLETE");
  }

  // ---- Phase 2: ABE ----
  if (CONFIG.doABE) {
    writeStatus("ABE", "STARTED");
    for (var f = 0; f < filters.length; f++) {
      var n = runABE(filters[f]);
      writeStatus("ABE", "DONE_" + filters[f], { count: n });
    }
    writeStatus("ABE", "COMPLETE");
  }

  // ---- Phase 3: SubframeSelector + SSWEIGHT ----
  var allApproved = [];
  var bestFiles   = {};

  if (CONFIG.doSubframe) {
    writeStatus("SUBFRAME", "STARTED");
    for (var f = 0; f < filters.length; f++) {
      var approved = runSubframeAndSSWEIGHT(filters[f]);
      allApproved  = allApproved.concat(approved);
      writeStatus("SUBFRAME", "DONE_" + filters[f], { approved: approved.length });
    }
    writeStatus("SUBFRAME", "COMPLETE", { totalApproved: allApproved.length });
  } else {
    // Charger les fichiers existants si on passe cette phase
    for (var f = 0; f < filters.length; f++) {
      var calDir = CONFIG.rootDir + "/" + filters[f] + "/calibrated";
      allApproved = allApproved.concat(findFiles(calDir, "*_c_abe_a.xisf"));
    }
  }

  // Charger les best images depuis les JSON
  for (var f = 0; f < filters.length; f++) {
    var bi = readJSON(CONFIG.resultDir + "/best_" + filters[f] + ".json");
    if (bi) bestFiles[filters[f]] = bi;
  }

  if (allApproved.length === 0) {
    writeStatus("ERROR", "NO_APPROVED_FILES");
    console.writeln("ERREUR: Aucun fichier approuvé. Vérifier les données source.");
    return;
  }

  // ---- Sélection de la référence StarAlignment ----
  var refFile = null;
  // Préférer le filtre défini dans CONFIG
  if (bestFiles[CONFIG.preferredRefFilter] && bestFiles[CONFIG.preferredRefFilter].path) {
    refFile = bestFiles[CONFIG.preferredRefFilter].path;
  } else {
    // Fallback: premier filtre disponible
    for (var f = 0; f < filters.length; f++) {
      if (bestFiles[filters[f]] && bestFiles[filters[f]].path) {
        refFile = bestFiles[filters[f]].path;
        break;
      }
    }
  }
  if (!refFile && allApproved.length > 0) refFile = allApproved[0];
  console.writeln("Référence StarAlignment: " + (refFile ? File.extractName(refFile) : "N/A"));

  // ---- Phase 4: StarAlignment ----
  if (CONFIG.doAlign && refFile) {
    writeStatus("ALIGNMENT", "STARTED", { total: allApproved.length, ref: File.extractName(refFile) });
    runStarAlignment(allApproved, refFile);
    writeStatus("ALIGNMENT", "COMPLETE");
  }

  // ---- Phase 5: ImageIntegration ----
  if (CONFIG.doIntegration) {
    writeStatus("INTEGRATION", "STARTED");
    for (var f = 0; f < filters.length; f++) {
      writeStatus("INTEGRATION", "RUNNING_" + filters[f]);
      runIntegration(filters[f]);
    }
    writeStatus("INTEGRATION", "COMPLETE");
  }

  // ---- Phase 6: DrizzleIntegration ----
  if (CONFIG.doDrizzle) {
    writeStatus("DRIZZLE", "STARTED");
    for (var f = 0; f < filters.length; f++) {
      writeStatus("DRIZZLE", "RUNNING_" + filters[f]);
      runDrizzle(filters[f]);
    }
    writeStatus("DRIZZLE", "COMPLETE");
  }

  // ---- Rapport final ----
  var report = {
    version:   "1.0.0",
    completed: (new Date()).toISOString(),
    rootDir:   CONFIG.rootDir,
    filters:   filters,
    approved:  allApproved.length,
    reference: refFile ? File.extractName(refFile) : "N/A",
    results:   {},
    bestImages: {}
  };

  for (var f = 0; f < filters.length; f++) {
    report.results[filters[f]] = {
      integration: CONFIG.resultDir + "/" + filters[f] + "_integration.xisf",
      drizzle:     CONFIG.resultDir + "/" + filters[f] + "_drizzle_2x.xisf"
    };
    if (bestFiles[filters[f]]) {
      report.bestImages[filters[f]] = {
        file: bestFiles[filters[f]].path ? File.extractName(bestFiles[filters[f]].path) : "N/A",
        ssw:  bestFiles[filters[f]].ssw  || 0,
        thresholds: bestFiles[filters[f]].thresholds || {},
        stats: bestFiles[filters[f]].stats || {}
      };
    }
  }

  writeJSON(CONFIG.resultDir + "/pipeline_report.json", report);
  writeStatus("COMPLETE", "ALL_DONE", { report: CONFIG.resultDir + "/pipeline_report.json" });

  console.writeln("");
  console.writeln("╔══════════════════════════════════════╗");
  console.writeln("║   PIPELINE COMPLETE - " + filters.join("+") + "        ║");
  console.writeln("╚══════════════════════════════════════╝");
  console.writeln("Rapport: " + CONFIG.resultDir + "/pipeline_report.json");
}

// ---- Lancement ----
main();
