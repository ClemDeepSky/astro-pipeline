// ============================================================
// ASTRO PIPELINE - Autonomous PixInsight Preprocessing
// Version: 1.5.2
// ============================================================
//
// USAGE: eval(File.readTextFile("C:/astro-pipeline/run_XXX.js"))
//        (ne jamais copier le code inline - risque d'erreurs silencieuses)
//
// Nouveautés v1.5.2 vs v1.5.1 :
//   - BUG FIXÉ : rejection maps finale détectées par snapshot avant/après executeGlobal
//     (l'ancienne détection par nom échouait si une fenêtre pré-existante contenait "integration")
//   - BUG FIXÉ (probes) : même approche snapshot dans probeIntegration
//   - FEATURE : CONFIG.saveProbes=true → sauvegarde chaque probe dans resultDir/probes/
//     Nom de fichier : {filtre}_probe_sH{x}_sL{y}_rH{%}pct_rL{%}pct_{stack|rejmap_high|rejmap_low}.xisf
//
// Nouveautés v1.5.1 vs v1.5.0 :
//   - BUG FIXÉ : rejection maps non sauvegardées (forceClose() dans boucle wins)
//     Fix : capturer highWin/lowWin/intWin d'abord, sauvegarder ensuite
//
// Nouveautés v1.5.0 vs v1.4.0 :
//   - log() : toutes les Console.writeln() dupliquées dans pipeline_console.log
//
// Nouveautés v1.4.0 vs v1.3.0 :
//   - Auto-optimisation sigma (coordinate descent + minimisation MAD)
//   - probeIntegration() : intégrations légères sans écriture disque
//   - findOptimalSigma() : balayage sigmaHigh puis sigmaLow, argmin MAD
//   - Sauvegarde rejection maps (high + low) de l'intégration finale
//   - {filter}_sigma_search.json : courbe sweep + sigma optimal
//   - CONFIG.autoSigma : true/false (false = comportement identique v1.3.0)
//
// Nouveautés v1.3.0 vs v1.2.1 :
//   - Critère Noise (fond de ciel) dans le score MAD+IQR
//   - Analyse inter-nuits : rejet automatique des nuits entières dégradées
//   - madFn() promu en fonction utilitaire globale
//   - debugColumns: true pour identifier les index de colonnes SubframeSelector
//
// Le script s'arrête et reprend là où il en était (resume automatique).
// Rapport final dans CONFIG.resultDir/pipeline_report.json
//
// ============================================================
// CONFIGURATION - À ADAPTER PAR SESSION
// (si CONFIG est déjà défini par un launcher externe, ce bloc est ignoré)
// ============================================================

if (typeof CONFIG === 'undefined') var CONFIG = {
  rootDir:           "D:/Gost",
  dofDir:            "D:/Terrapixa Dropbox/clement ver eecke/ARO/PIX",
  resultDir:         "D:/Gost/result",

  // Filtres à traiter (null = auto-détection depuis les sous-dossiers)
  filters:           null,

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

  // Auto-optimisation sigma (coordinate descent + minimisation MAD)
  // false = valeurs sigmaLow/sigmaHigh fixes ci-dessus (comportement v1.3.0)
  autoSigma:           true,
  autoSigmaHighRange:  [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0],
  autoSigmaLowRange:   [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5],

  // DrizzleIntegration
  drizzleScale:      2.0,
  drizzleDropShrink: 0.90,

  // SubframeSelector - sélection robuste par score global (MAD + IQR)
  // Poids des pénalités de dégradation par critère :
  wSNR:              1.0,   // SNR (plus élevé = meilleure image)
  wFWHM:             1.2,   // FWHM surpondérée (impact résolution)
  wStars:            1.0,   // Nombre d'étoiles
  wNoise:            0.8,   // Bruit résiduel (proxy du fond de ciel / nuages)
                            // 0 = critère désactivé, >1.0 = plus agressif

  // Seuil de rejet individuel : Q3 + iqrMult * IQR sur la distribution des scores
  iqrMult:           1.5,

  // Analyse inter-nuits : rejet des nuits entières statistiquement dégradées
  // (actif uniquement si la session couvre ≥2 nuits avec ≥3 images chacune)
  rejectBadNights:   true,
  nightIqrMult:      1.5,   // Seuil IQR pour le rejet de nuit entière
  minNightSize:      3,     // Nombre minimum d'images pour analyser une nuit

  // Debug : affiche tous les index de colonnes SubframeSelector (première image)
  // Mettre à true une fois pour vérifier/confirmer idx_Noise
  debugColumns:      false,

  // Index de colonne Noise dans sfs.measurements (à confirmer via debugColumns)
  noiseColIdx:       10,

  // Subframe scale (arcsec/px - dépend de la caméra/optique)
  subframeScale:     2.26,

  // Filtre préféré pour la référence StarAlignment
  preferredRefFilter: "R",
}; // fin CONFIG (guard: ignoré si CONFIG déjà défini)

// ============================================================
// LOGGER — console + fichier disque
// ============================================================
var _logFile = null;
function log(msg) {
    Console.writeln(msg);
    try {
        if (_logFile === null && typeof CONFIG !== 'undefined' && CONFIG.resultDir) {
            if (!File.directoryExists(CONFIG.resultDir)) {
                File.createDirectory(CONFIG.resultDir, true);
            }
            _logFile = CONFIG.resultDir + "/pipeline_console.log";
            // Write header on first call
            File.appendToTextFile(_logFile, "\n==== SESSION " + (new Date().toISOString()) + " ====\n");
        }
        if (_logFile !== null) {
            File.appendToTextFile(_logFile, msg + "\n");
        }
    } catch(e) { /* never break pipeline for logging */ }
}

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
  log("[" + phase + "] " + msg);
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

// madFn : Median Absolute Deviation (fonction globale réutilisable)
function madFn(arr, med) {
  var devs = [];
  for (var i = 0; i < arr.length; i++) devs.push(Math.abs(arr[i] - med));
  return percentile(devs, 50);
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
// ANALYSE INTER-NUITS
// ============================================================

// Extrait la date de nuit astronomique depuis un nom de fichier.
// Convention : images prises avant 12h00 appartiennent à la nuit précédente.
// Format attendu : ..._YYYY-MM-DD_HH-MM-SS_...
function extractNight(filename) {
  var m = filename.match(/_(\d{4})-(\d{2})-(\d{2})_(\d{2})-/);
  if (!m) return "unknown";
  var year  = parseInt(m[1]);
  var month = parseInt(m[2]);
  var day   = parseInt(m[3]);
  var hour  = parseInt(m[4]);

  if (hour < 12) {
    // Avant midi → appartient à la nuit précédente
    day--;
    if (day < 1) {
      month--;
      if (month < 1) { month = 12; year--; }
      var daysInMonth = [0,31,28,31,30,31,30,31,31,30,31,30,31];
      if (month === 2 && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)) {
        day = 29;
      } else {
        day = daysInMonth[month];
      }
    }
  }
  var mm = (month < 10 ? "0" : "") + month;
  var dd = (day   < 10 ? "0" : "") + day;
  return year + "-" + mm + "-" + dd;
}

// Analyse les nuits et rejette les nuits entières statistiquement dégradées.
// Retourne le sous-ensemble de data dont les nuits sont acceptables.
// data : tableau d'objets { path, fwhm, snr, stars, noise, ... }
function rejectBadNightsFilter(data, filter) {
  if (!CONFIG.rejectBadNights) return data;

  // --- Grouper par nuit ---
  var nights = {};
  for (var i = 0; i < data.length; i++) {
    var night = extractNight(File.extractName(data[i].path));
    if (!nights[night]) nights[night] = [];
    nights[night].push(data[i]);
  }

  var nightKeys = [];
  for (var n in nights) nightKeys.push(n);

  if (nightKeys.length <= 1) {
    log("  [" + filter + "] NIGHTS: session mono-nuit → analyse inter-nuits ignorée");
    return data;
  }

  // --- Calculer la médiane de chaque métrique par nuit ---
  var nightStats = [];
  for (var ni = 0; ni < nightKeys.length; ni++) {
    var nKey  = nightKeys[ni];
    var imgs  = nights[nKey];

    if (imgs.length < CONFIG.minNightSize) {
      log("  [" + filter + "] NIGHTS: nuit " + nKey +
        " (" + imgs.length + " images < minNightSize=" + CONFIG.minNightSize +
        ") → exclue de l'analyse inter-nuits");
      nightStats.push({ night: nKey, count: imgs.length, skip: true, images: imgs });
      continue;
    }

    var nFWHM  = imgs.map(function(d) { return d.fwhm;  });
    var nSNR   = imgs.map(function(d) { return d.snr;   });
    var nStars = imgs.map(function(d) { return d.stars; });
    var nNoise = imgs.map(function(d) { return d.noise; });

    nightStats.push({
      night:     nKey,
      count:     imgs.length,
      skip:      false,
      medFWHM:   percentile(nFWHM,  50),
      medSNR:    percentile(nSNR,   50),
      medStars:  percentile(nStars, 50),
      medNoise:  percentile(nNoise, 50),
      images:    imgs
    });
  }

  // Nuits analysables (pas skip)
  var analyzable = nightStats.filter(function(ns) { return !ns.skip; });

  if (analyzable.length <= 1) {
    log("  [" + filter + "] NIGHTS: pas assez de nuits analysables → analyse ignorée");
    return data;
  }

  // --- MAD+IQR inter-nuits ---
  var aMedFWHM  = analyzable.map(function(ns) { return ns.medFWHM;  });
  var aMedSNR   = analyzable.map(function(ns) { return ns.medSNR;   });
  var aMedStars = analyzable.map(function(ns) { return ns.medStars; });
  var aMedNoise = analyzable.map(function(ns) { return ns.medNoise; });

  var gMedFWHM  = percentile(aMedFWHM,  50);
  var gMedSNR   = percentile(aMedSNR,   50);
  var gMedStars = percentile(aMedStars, 50);
  var gMedNoise = percentile(aMedNoise, 50);

  var gMadFWHM  = Math.max(madFn(aMedFWHM,  gMedFWHM),  1e-6);
  var gMadSNR   = Math.max(madFn(aMedSNR,   gMedSNR),   1e-6);
  var gMadStars = Math.max(madFn(aMedStars, gMedStars),  1e-6);
  var gMadNoise = Math.max(madFn(aMedNoise, gMedNoise),  1e-6);

  var nightScores = [];
  for (var ni = 0; ni < analyzable.length; ni++) {
    var ns = analyzable[ni];
    ns.z_FWHM  = Math.max(0, (ns.medFWHM  - gMedFWHM)  / gMadFWHM);
    ns.z_SNR   = Math.max(0, (gMedSNR     - ns.medSNR)  / gMadSNR);
    ns.z_Stars = Math.max(0, (gMedStars   - ns.medStars) / gMadStars);
    ns.z_Noise = Math.max(0, (ns.medNoise - gMedNoise)  / gMadNoise);

    var nbDeg = (ns.z_FWHM  > 1 ? 1 : 0) + (ns.z_SNR   > 1 ? 1 : 0) +
                (ns.z_Stars > 1 ? 1 : 0) + (ns.z_Noise > 1 ? 1 : 0);
    ns.bonus      = (nbDeg >= 2 ? 1 : 0) + (nbDeg >= 3 ? 1 : 0);
    ns.nightScore = CONFIG.wFWHM  * ns.z_FWHM  + CONFIG.wSNR   * ns.z_SNR  +
                    CONFIG.wStars * ns.z_Stars  + CONFIG.wNoise * ns.z_Noise + ns.bonus;
    nightScores.push(ns.nightScore);
  }

  var Q1n  = percentile(nightScores, 25);
  var Q3n  = percentile(nightScores, 75);
  var IQRn = Q3n - Q1n;
  var nightThreshold = Q3n + CONFIG.nightIqrMult * IQRn;

  log("  [" + filter + "] NIGHTS: " + analyzable.length + " nuits analysées" +
    " | seuil score=" + nightThreshold.toFixed(3));

  var rejectedPaths = {};
  var nightLog = [];

  for (var ni = 0; ni < analyzable.length; ni++) {
    var ns = analyzable[ni];
    var bad = (ns.nightScore > nightThreshold);
    var status = bad ? "REJETÉE" : "OK";

    log("  [" + filter + "] NIGHTS:   " + ns.night +
      " (" + ns.count + " img)" +
      " FWHM=" + ns.medFWHM.toFixed(2)  + "\"" +
      " SNR="  + ns.medSNR.toFixed(3)   +
      " Stars=" + Math.round(ns.medStars) +
      " Noise=" + ns.medNoise.toFixed(5) +
      " → score=" + ns.nightScore.toFixed(2) + " [" + status + "]");

    if (bad) {
      for (var ii = 0; ii < ns.images.length; ii++) {
        rejectedPaths[ns.images[ii].path] = ns.night;
      }
      nightLog.push({ night: ns.night, count: ns.count, score: ns.nightScore.toFixed(3),
        medFWHM: ns.medFWHM, medSNR: ns.medSNR, medStars: Math.round(ns.medStars) });
    }
  }

  var filtered = data.filter(function(d) { return !rejectedPaths[d.path]; });
  var nRej = data.length - filtered.length;

  if (nRej > 0) {
    log("  [" + filter + "] NIGHTS: " + nRej +
      " images rejetées (nuits dégradées)");
  } else {
    log("  [" + filter + "] NIGHTS: toutes les nuits acceptées");
  }

  return filtered;
}

// ============================================================
// PHASE 0 : Détection des filtres
// ============================================================

function detectFilters() {
  var known = ["B", "G", "R", "L", "H", "S", "O", "V"];
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

  var biasDir = CONFIG.dofDir + "/MasterBias";
  var darkDir = CONFIG.dofDir + "/MasterDarks";
  var flatDir = CONFIG.dofDir + "/MasterFlats";

  var biasFiles = File.directoryExists(biasDir) ? findFiles(biasDir, "*.xisf")
                : searchRecursive(CONFIG.dofDir, "*SuperBias*.xisf");
  var darkFiles = File.directoryExists(darkDir) ? findFiles(darkDir, "*.xisf")
                : searchRecursive(CONFIG.dofDir, "*Dark*.xisf");
  var flatFiles = File.directoryExists(flatDir) ? findFiles(flatDir, "*.xisf")
                : searchRecursive(CONFIG.dofDir, "*Flat_" + filter + "*.xisf");

  // SuperBias
  var biasByTemp = biasFiles.filter(function(f) {
    return f.indexOf("-" + tempRounded + "-") >= 0 ||
           f.indexOf("-" + tempRounded + ".") >= 0 ||
           f.indexOf("-" + Math.abs(tempRounded) + ".") >= 0;
  });
  dof.bias = (biasByTemp.length > 0) ? biasByTemp[0]
           : (biasFiles.length > 0 ? biasFiles[0] : null);

  // Dark
  var darkByExpTemp = darkFiles.filter(function(f) {
    return f.indexOf("-" + expInt + "-" + tempRounded) >= 0 ||
           f.indexOf("-" + expInt + "-" + Math.abs(tempRounded)) >= 0;
  });
  if (darkByExpTemp.length > 0) {
    dof.dark = darkByExpTemp[0];
  } else {
    var darkByExp = darkFiles.filter(function(f) { return f.indexOf("-" + expInt + "-") >= 0; });
    dof.dark = (darkByExp.length > 0) ? darkByExp[0]
             : (darkFiles.length > 0 ? darkFiles[0] : null);
  }

  // Flat avec alias filtre (V→G, C→L, O→OIII)
  var flatAliases = { "V": "G", "C": "L", "O": "OIII" };
  var flatFilter = filter;
  var flatByFilter = flatFiles.filter(function(f) {
    return f.indexOf("_" + flatFilter + "_") >= 0 || f.indexOf("_" + flatFilter + "-") >= 0;
  });
  if (flatByFilter.length === 0 && flatAliases[filter]) {
    flatFilter = flatAliases[filter];
    flatByFilter = flatFiles.filter(function(f) {
      return f.indexOf("_" + flatFilter + "_") >= 0 || f.indexOf("_" + flatFilter + "-") >= 0;
    });
    if (flatByFilter.length > 0) {
      log("  DOF flat: alias " + filter + "→" + flatFilter);
    }
  }
  if (flatByFilter.length > 0) {
    var flatByFilterTemp = flatByFilter.filter(function(f) {
      return f.indexOf("-" + Math.abs(tempRounded) + ".") >= 0 ||
             f.indexOf("-" + Math.abs(tempRounded) + "-") >= 0;
    });
    dof.flat = (flatByFilterTemp.length > 0) ? flatByFilterTemp[0] : flatByFilter[0];
  }

  log("  DOF " + filter + " (T=" + tempRounded + "°C Exp=" + expInt + "s):" +
    " bias=" + (dof.bias ? File.extractName(dof.bias) : "NONE") +
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

  var rawFiles = [];
  var ff = new FileFind();
  if (ff.begin(srcDir + "/*")) {
    do {
      if (ff.name !== "." && ff.name !== "..") {
        var ext = File.extractExtension(ff.name).toLowerCase();
        if ((ext===".fit" || ext===".fits" || ext===".xisf") &&
            ff.name.indexOf("_c.") < 0 && ff.name.indexOf("_c_") < 0) {
          rawFiles.push(srcDir + "/" + ff.name);
        }
      }
    } while (ff.next());
  }
  rawFiles.sort();

  if (rawFiles.length === 0) {
    log("  [" + filter + "] No raw files - skipping calibration");
    return 0;
  }

  var existing = findFiles(calDir, "*_c.xisf");
  if (existing.length >= rawFiles.length * 0.9) {
    log("  [" + filter + "] Calibration already done (" + existing.length + " files)");
    return existing.length;
  }

  var temp = parseTempFromFilename(rawFiles[0]);
  var expTime = parseExpFromFilename(rawFiles[0]);
  var dof = findDOFMasters(filter, temp, expTime);

  var ic = new ImageCalibration();
  ic.targetFrames = rawFiles.map(function(f) { return [true, f]; });
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
  log("  [" + filter + "] Calibrated: " + count + "/" + rawFiles.length);
  return count;
}

// ============================================================
// PHASE 3 : ABE deg 1
// ============================================================

function runABE(filter) {
  var calDir = CONFIG.rootDir + "/" + filter + "/calibrated";

  var calFiles = [];
  var p1 = findFiles(calDir, "*_c.xisf");
  var p2 = findFiles(calDir, "*_c.fit");
  calFiles = p1.concat(p2);
  calFiles.sort();

  if (calFiles.length === 0) {
    log("  [" + filter + "] No calibrated files for ABE");
    return 0;
  }

  var existing = findFiles(calDir, "*_c_abe.xisf");
  if (existing.length >= calFiles.length * 0.9) {
    log("  [" + filter + "] ABE already done (" + existing.length + " files)");
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

    // Hash map des IDs ouverts avant ABE (O(1) lookup)
    var idsBefore = {};
    ImageWindow.windows.forEach(function(w) { idsBefore[w.mainView.id] = true; });
    abe.executeOn(win.mainView);
    // Fermer TOUTES les nouvelles fenêtres créées par ABE (background model)
    // win.mainView.id est dans idsBefore → il ne sera pas fermé
    var winsAfter = ImageWindow.windows;
    for (var wi = winsAfter.length - 1; wi >= 0; wi--) {
      if (!idsBefore[winsAfter[wi].mainView.id]) winsAfter[wi].forceClose();
    }

    win.saveAs(outPath, false, false, false, false);
    win.forceClose();
    processed++;

    if (processed % 10 === 0) {
      writeStatus("ABE_" + filter, "RUNNING", { done: processed, total: calFiles.length });
    }
  }

  log("  [" + filter + "] ABE done: " + processed + "/" + calFiles.length);
  return processed;
}

// ============================================================
// PHASE 4 : SubframeSelector + Analyse inter-nuits + SSWEIGHT
// ============================================================

function runSubframeAndSSWEIGHT(filter) {
  var calDir = CONFIG.rootDir + "/" + filter + "/calibrated";
  var abeFiles = findFiles(calDir, "*_c_abe.xisf");

  if (abeFiles.length === 0) {
    log("  [" + filter + "] No ABE files for SubframeSelector");
    return [];
  }

  // Resume
  var existingA = findFiles(calDir, "*_c_abe_a.xisf");
  if (existingA.length >= abeFiles.length * 0.9) {
    log("  [" + filter + "] SSWEIGHT already done (" + existingA.length + " files)");
    return existingA;
  }

  // --- SubframeSelector : mesure uniquement ---
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

  // Diagnostic optionnel : log de tous les index de colonnes (première ligne)
  if (CONFIG.debugColumns && measurements.length > 0) {
    var row0 = measurements[0];
    log("  [" + filter + "] DEBUG colonnes SubframeSelector (" +
      row0.length + " colonnes) :");
    for (var ci = 0; ci < row0.length; ci++) {
      log("    col[" + ci + "] = " + row0[ci]);
    }
  }

  // Colonnes connues : idx3=path, idx5=FWHM, idx6=Eccentricity,
  //                   idx7=SNRWeight, idx10=Noise (à confirmer), idx14=Stars
  var data = [];
  var fwhmArr = [], snrArr = [], starsArr = [], noiseArr = [];

  for (var m = 0; m < measurements.length; m++) {
    var row   = measurements[m];
    var path  = row[3];
    var fwhm  = row[5];
    var ecc   = row[6];
    var snr   = row[7];
    var noise = (row.length > CONFIG.noiseColIdx) ? row[CONFIG.noiseColIdx] : 0;
    var stars = row[14];

    if (fwhm > 0 && snr > 0) {
      data.push({ path: path, fwhm: fwhm, ecc: ecc, snr: snr,
                  noise: noise, stars: stars });
      fwhmArr.push(fwhm);
      snrArr.push(snr);
      starsArr.push(stars);
      noiseArr.push(noise);
    }
  }

  if (data.length === 0) {
    log("  [" + filter + "] WARNING: No measurements returned");
    return [];
  }

  // =============================================================
  // ÉTAPE A : Rejet des nuits entières dégradées (inter-nuits)
  // =============================================================
  data = rejectBadNightsFilter(data, filter);

  if (data.length === 0) {
    log("  [" + filter + "] ERREUR: toutes les nuits rejetées — vérifier les données");
    return [];
  }

  // Recalculer les tableaux sur le set filtré
  fwhmArr  = data.map(function(d) { return d.fwhm;  });
  snrArr   = data.map(function(d) { return d.snr;   });
  starsArr = data.map(function(d) { return d.stars; });
  noiseArr = data.map(function(d) { return d.noise; });

  // =============================================================
  // ÉTAPE B : MAD+IQR individuel sur les images des nuits retenues
  // =============================================================

  // Médiane de chaque critère
  var medSNR   = percentile(snrArr,   50);
  var medFWHM  = percentile(fwhmArr,  50);
  var medStars = percentile(starsArr, 50);
  var medNoise = percentile(noiseArr, 50);

  // MAD (dispersion robuste)
  var dispSNR   = Math.max(madFn(snrArr,   medSNR),   1e-6);
  var dispFWHM  = Math.max(madFn(fwhmArr,  medFWHM),  1e-6);
  var dispStars = Math.max(madFn(starsArr, medStars),  1e-6);
  var dispNoise = Math.max(madFn(noiseArr, medNoise),  1e-6);

  log("  [" + filter + "] Médiane: FWHM=" + medFWHM.toFixed(2) +
    "\" SNR=" + medSNR.toFixed(3) + " Stars=" + Math.round(medStars) +
    " Noise=" + medNoise.toFixed(5));
  log("  [" + filter + "] MAD:     FWHM=" + dispFWHM.toFixed(2) +
    "\" SNR=" + dispSNR.toFixed(3) + " Stars=" + Math.round(dispStars) +
    " Noise=" + dispNoise.toFixed(5));

  // z-scores de dégradation (>0 uniquement si pire que la médiane)
  for (var i = 0; i < data.length; i++) {
    var d = data[i];
    d.zSNR   = Math.max(0, (medSNR   - d.snr)   / dispSNR);
    d.zFWHM  = Math.max(0, (d.fwhm   - medFWHM) / dispFWHM);
    d.zStars = Math.max(0, (medStars  - d.stars) / dispStars);
    d.zNoise = (CONFIG.wNoise > 0 && medNoise > 0)
               ? Math.max(0, (d.noise - medNoise) / dispNoise)
               : 0;
  }

  // Score global avec bonus de cumulation
  // (bonus +1 si ≥2 critères z>1, +1 si les 3+ le sont)
  var scoreArr = [];
  for (var i = 0; i < data.length; i++) {
    var d = data[i];
    var nbDeg = (d.zSNR   > 1 ? 1 : 0) + (d.zFWHM  > 1 ? 1 : 0) +
                (d.zStars > 1 ? 1 : 0) + (d.zNoise > 1 ? 1 : 0);
    d.bonus = (nbDeg >= 2 ? 1 : 0) + (nbDeg >= 3 ? 1 : 0);
    d.score = CONFIG.wSNR   * d.zSNR   + CONFIG.wFWHM  * d.zFWHM  +
              CONFIG.wStars * d.zStars + CONFIG.wNoise * d.zNoise  + d.bonus;
    scoreArr.push(d.score);
  }

  // Seuil IQR
  var Q1        = percentile(scoreArr, 25);
  var Q3        = percentile(scoreArr, 75);
  var IQR       = Q3 - Q1;
  var threshold = Q3 + CONFIG.iqrMult * IQR;

  log("  [" + filter + "] Score IQR: Q1=" + Q1.toFixed(3) +
    " Q3=" + Q3.toFixed(3) + " IQR=" + IQR.toFixed(3) +
    " → seuil=" + threshold.toFixed(3));

  // Approbation individuelle
  var approved = [];
  var rejectionLog = [];
  for (var i = 0; i < data.length; i++) {
    var d = data[i];
    if (d.score <= threshold) {
      approved.push(d);
    } else {
      var reasons = [];
      if (d.zSNR   > 0) reasons.push("SNR="   + d.snr.toFixed(3)   + " (z=" + d.zSNR.toFixed(2)   + ")");
      if (d.zFWHM  > 0) reasons.push("FWHM="  + d.fwhm.toFixed(2)  + "\" (z=" + d.zFWHM.toFixed(2)  + ")");
      if (d.zStars > 0) reasons.push("Stars=" + Math.round(d.stars) + " (z=" + d.zStars.toFixed(2) + ")");
      if (d.zNoise > 0) reasons.push("Noise=" + d.noise.toFixed(5)  + " (z=" + d.zNoise.toFixed(2) + ")");
      rejectionLog.push({ file: File.extractName(d.path), score: d.score.toFixed(3), reasons: reasons });
    }
  }

  var rejected = data.length - approved.length;
  log("  [" + filter + "] Approuvés: " + approved.length + "/" + data.length +
    " (rejetés: " + rejected + ", seuil score=" + threshold.toFixed(3) + ")");

  if (rejectionLog.length > 0) {
    log("  [" + filter + "] Images rejetées :");
    for (var r = 0; r < rejectionLog.length; r++) {
      var rl = rejectionLog[r];
      log("    score=" + rl.score + " " + rl.file + " | " + rl.reasons.join(", "));
    }
  }

  if (approved.length === 0) {
    log("  [" + filter + "] ERREUR: aucun fichier approuvé - vérifier les paramètres");
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

    var outPath = img.path.replace(/_c_abe\.xisf$/i, "_c_abe_a.xisf");

    if (fileExists(outPath)) {
      outputFiles.push(outPath);
      continue;
    }

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

  // Sauvegarde du rapport de sélection
  var bestInfo = {
    filter: filter,
    path: bestPath,
    ssw: bestSSW,
    algorithm: "MAD+IQR+Noise+Nights v1.3.0",
    thresholds: { scoreMax: threshold, Q1: Q1, Q3: Q3, IQR: IQR },
    stats: {
      total: data.length, approved: approved.length, rejected: rejected,
      fwhm:  { min: Math.min.apply(null,fwhmArr),  max: Math.max.apply(null,fwhmArr),
               med: medFWHM,  mad: dispFWHM  },
      snr:   { min: Math.min.apply(null,snrArr),   max: Math.max.apply(null,snrArr),
               med: medSNR,   mad: dispSNR   },
      stars: { min: Math.round(Math.min.apply(null,starsArr)),
               max: Math.round(Math.max.apply(null,starsArr)),
               med: Math.round(medStars), mad: Math.round(dispStars) },
      noise: { min: Math.min.apply(null,noiseArr), max: Math.max.apply(null,noiseArr),
               med: medNoise, mad: dispNoise }
    },
    rejectionLog: rejectionLog
  };
  writeJSON(CONFIG.resultDir + "/best_" + filter + ".json", bestInfo);

  log("  [" + filter + "] Best: " + (bestPath ? File.extractName(bestPath) : "N/A") +
    " SSWEIGHT=" + bestSSW.toFixed(2));
  return outputFiles;
}

// ============================================================
// PHASE 5 : StarAlignment (mode Intersection/Always)
// ============================================================

function runStarAlignment(allApprovedFiles, referenceFile) {
  var alreadyDone = 0;
  for (var i = 0; i < allApprovedFiles.length; i++) {
    if (fileExists(allApprovedFiles[i].replace("_c_abe_a.xisf", "_c_abe_a_r.xisf"))) {
      alreadyDone++;
    }
  }
  if (alreadyDone >= allApprovedFiles.length * 0.9) {
    log("StarAlignment already done (" + alreadyDone + " files)");
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
  log("StarAlignment complete");
}

// ============================================================
// AUTO-SIGMA : probeIntegration + findOptimalSigma
// ============================================================

// Exécute une intégration probe (sans drizzle).
// saveInfo (optionnel) : { dir, filter } → sauvegarde stack + rejection maps
//   dans dir/ avec filename encodant les sigma et taux de rejet.
// Retourne { mad, rejRateHigh, rejRateLow }.
function probeIntegration(images, sigmaLow, sigmaHigh, saveInfo) {
  var result = { mad: 999999, rejRateHigh: 0, rejRateLow: 0 };
  if (images.length === 0) return result;

  // Tableau probe sans chemin drizzle (generateDrizzleData=false)
  var probeImages = [];
  for (var pi = 0; pi < images.length; pi++) {
    probeImages.push([images[pi][0], images[pi][1], "", ""]);
  }

  // Snapshot des fenêtres ouvertes AVANT executeGlobal (détection robuste)
  var idsBeforeProbe = {};
  ImageWindow.windows.forEach(function(w) { idsBeforeProbe[w.mainView.id] = true; });

  var ii = new ImageIntegration();
  ii.images                 = probeImages;
  ii.combination            = ImageIntegration.prototype.Average;
  ii.weightMode             = ImageIntegration.prototype.KeywordWeight;
  ii.weightKeyword          = "SSWEIGHT";
  ii.weightScale            = ImageIntegration.prototype.WeightScale_BWMV;
  ii.minWeight              = 0.005;
  ii.normalization          = ImageIntegration.prototype.AdditiveWithScaling;
  ii.rejection              = ImageIntegration.prototype.SigmaClip;
  ii.rejectionNormalization = ImageIntegration.prototype.Scale;
  ii.sigmaLow               = sigmaLow;
  ii.sigmaHigh              = sigmaHigh;
  ii.clipLow                = true;
  ii.clipHigh               = true;
  ii.generateDrizzleData    = false;
  ii.generateIntegratedImage = true;
  ii.generateRejectionMaps  = true;

  ii.executeGlobal();

  // Identifier UNIQUEMENT les nouvelles fenêtres créées par cette exécution
  var intWin  = null;
  var highWin = null;
  var lowWin  = null;
  var winsAfterProbe = ImageWindow.windows;
  for (var w = 0; w < winsAfterProbe.length; w++) {
    var pw = winsAfterProbe[w];
    if (idsBeforeProbe[pw.mainView.id]) continue;  // fenêtre pré-existante
    var vid = pw.mainView.id.toLowerCase();
    if      (vid.indexOf("rejected_high") >= 0) { highWin = pw; }
    else if (vid.indexOf("rejected_low")  >= 0) { lowWin  = pw; }
    else                                         { intWin  = pw; }
  }

  // MAD du stack (channel 0 — représentatif pour L et RGB)
  if (intWin !== null) {
    try { result.mad = intWin.mainView.image.MAD(0); }
    catch(e) { result.mad = 999999; }
  }

  // Taux de rejet : mean d'une rejection map binaire (0=conservé, 1=rejeté)
  if (highWin !== null) {
    try { result.rejRateHigh = highWin.mainView.image.mean(0); }
    catch(e) { result.rejRateHigh = 0; }
  }
  if (lowWin !== null) {
    try { result.rejRateLow = lowWin.mainView.image.mean(0); }
    catch(e) { result.rejRateLow = 0; }
  }

  // Sauvegarde optionnelle : stack + rejection maps avec sigma+taux dans le nom
  if (saveInfo && saveInfo.dir && saveInfo.filter) {
    var rH  = (result.rejRateHigh * 100).toFixed(2);
    var rL  = (result.rejRateLow  * 100).toFixed(2);
    var tag = saveInfo.filter +
              "_probe_sH" + sigmaHigh.toFixed(1) +
              "_sL"       + sigmaLow.toFixed(1) +
              "_rH"       + rH + "pct" +
              "_rL"       + rL + "pct";
    ensureDir(saveInfo.dir);
    if (intWin)  intWin.saveAs (saveInfo.dir + "/" + tag + "_stack.xisf",        false, false, false, false);
    if (highWin) highWin.saveAs(saveInfo.dir + "/" + tag + "_rejmap_high.xisf",  false, false, false, false);
    if (lowWin)  lowWin.saveAs (saveInfo.dir + "/" + tag + "_rejmap_low.xisf",   false, false, false, false);
  }

  closeAllWindows();
  return result;
}

// Recherche par descente de coordonnées les sigma optimaux minimisant le MAD.
// Phase A : balaye autoSigmaHighRange (sigmaLow fixe au milieu de la plage low)
// Phase B : balaye autoSigmaLowRange  (sigmaHigh fixe = meilleur de la Phase A)
// Retourne { sigmaLow, sigmaHigh, sweepHigh, sweepLow }
function findOptimalSigma(filter, images) {
  var highRange = CONFIG.autoSigmaHighRange;
  var lowRange  = CONFIG.autoSigmaLowRange;

  // saveInfo passé à probeIntegration si CONFIG.saveProbes est activé
  var saveInfo = (CONFIG.saveProbes)
    ? { dir: CONFIG.resultDir + "/probes", filter: filter }
    : null;

  // Guard : plages vides → fallback sur valeurs fixes
  if (!highRange || highRange.length === 0 ||
      !lowRange  || lowRange.length  === 0) {
    log("  [" + filter + "] AUTOSIGMA: plages vides — sigma fixe utilisé");
    return { sigmaLow: CONFIG.sigmaLow, sigmaHigh: CONFIG.sigmaHigh,
             sweepHigh: [], sweepLow: [] };
  }

  var sigmaLow_init = lowRange[Math.floor(lowRange.length / 2)];
  var totalProbes   = highRange.length + lowRange.length;

  log("  [" + filter + "] AUTOSIGMA Phase A — balayage sigmaHigh " +
    "[" + highRange.join(", ") + "] (sigmaLow fixe=" + sigmaLow_init + ")");

  // ---- Phase A : balayage sigmaHigh ----
  var sweepHigh    = [];
  var bestHighMAD  = 999999;
  var bestSigmaHigh = highRange[0];

  for (var hi = 0; hi < highRange.length; hi++) {
    var sigH = highRange[hi];
    writeStatus("AUTOSIGMA_" + filter, "SWEEP_HIGH_" + sigH,
      { probe: hi + 1, total: totalProbes });

    var r = probeIntegration(images, sigmaLow_init, sigH, saveInfo);

    sweepHigh.push({
      sigmaHigh:   sigH,
      sigmaLow:    sigmaLow_init,
      mad:         r.mad,
      rejRateHigh: r.rejRateHigh,
      rejRateLow:  r.rejRateLow
    });

    log("    sigmaHigh=" + sigH.toFixed(1) +
      "  MAD=" + r.mad.toFixed(7) +
      "  rejHigh=" + (r.rejRateHigh * 100).toFixed(2) + "%" +
      "  rejLow="  + (r.rejRateLow  * 100).toFixed(2) + "%");

    if (r.mad < bestHighMAD) {
      bestHighMAD   = r.mad;
      bestSigmaHigh = sigH;
    }
  }

  log("  [" + filter + "] Phase A terminée — bestSigmaHigh=" +
    bestSigmaHigh + " (MAD=" + bestHighMAD.toFixed(7) + ")");

  // ---- Phase B : balayage sigmaLow (sigmaHigh fixé) ----
  log("  [" + filter + "] AUTOSIGMA Phase B — balayage sigmaLow " +
    "[" + lowRange.join(", ") + "] (sigmaHigh fixe=" + bestSigmaHigh + ")");

  var sweepLow    = [];
  var bestLowMAD  = 999999;
  var bestSigmaLow = lowRange[0];

  for (var li = 0; li < lowRange.length; li++) {
    var sigL = lowRange[li];
    writeStatus("AUTOSIGMA_" + filter, "SWEEP_LOW_" + sigL,
      { probe: highRange.length + li + 1, total: totalProbes });

    var r = probeIntegration(images, sigL, bestSigmaHigh, saveInfo);

    sweepLow.push({
      sigmaHigh:   bestSigmaHigh,
      sigmaLow:    sigL,
      mad:         r.mad,
      rejRateHigh: r.rejRateHigh,
      rejRateLow:  r.rejRateLow
    });

    log("    sigmaLow=" + sigL.toFixed(1) +
      "  MAD=" + r.mad.toFixed(7) +
      "  rejHigh=" + (r.rejRateHigh * 100).toFixed(2) + "%" +
      "  rejLow="  + (r.rejRateLow  * 100).toFixed(2) + "%");

    if (r.mad < bestLowMAD) {
      bestLowMAD   = r.mad;
      bestSigmaLow = sigL;
    }
  }

  log("  [" + filter + "] Phase B terminée — bestSigmaLow=" +
    bestSigmaLow + " (MAD=" + bestLowMAD.toFixed(7) + ")");

  // ---- Tableau récapitulatif console ----
  log("  [" + filter + "] ── RÉSULTAT AUTOSIGMA ──────────────────");
  log("  [" + filter + "]   sigmaLow=" + bestSigmaLow +
    "  sigmaHigh=" + bestSigmaHigh);
  log("  [" + filter + "]   Sweep High (" + sweepHigh.length + " probes) :");
  for (var s = 0; s < sweepHigh.length; s++) {
    var sw = sweepHigh[s];
    var marker = (sw.sigmaHigh === bestSigmaHigh) ? "  ← BEST" : "";
    log("  [" + filter + "]     sigmaHigh=" + sw.sigmaHigh.toFixed(1) +
      "  MAD=" + sw.mad.toFixed(7) + marker);
  }
  log("  [" + filter + "]   Sweep Low (" + sweepLow.length + " probes) :");
  for (var s = 0; s < sweepLow.length; s++) {
    var sw = sweepLow[s];
    var marker = (sw.sigmaLow === bestSigmaLow) ? "  ← BEST" : "";
    log("  [" + filter + "]     sigmaLow=" + sw.sigmaLow.toFixed(1) +
      "  MAD=" + sw.mad.toFixed(7) + marker);
  }
  log("  [" + filter + "] ────────────────────────────────────────");

  // ---- Export JSON ----
  var searchData = {
    filter:        filter,
    ts:            (new Date()).toISOString(),
    algorithm:     "coordinate-descent-MAD v1.4.0",
    nImages:       images.length,
    sigmaLow_init: sigmaLow_init,
    bestSigmaHigh: bestSigmaHigh,
    bestSigmaLow:  bestSigmaLow,
    bestMAD_High:  bestHighMAD,
    bestMAD_Low:   bestLowMAD,
    sweepHigh:     sweepHigh,
    sweepLow:      sweepLow
  };
  writeJSON(CONFIG.resultDir + "/" + filter + "_sigma_search.json", searchData);
  log("  [" + filter + "] Sigma search JSON: " +
    CONFIG.resultDir + "/" + filter + "_sigma_search.json");

  return {
    sigmaLow:  bestSigmaLow,
    sigmaHigh: bestSigmaHigh,
    sweepHigh: sweepHigh,
    sweepLow:  sweepLow
  };
}

// ============================================================
// PHASE 6 : ImageIntegration
// ============================================================

function runIntegration(filter) {
  var calDir  = CONFIG.rootDir + "/" + filter + "/calibrated";
  var outPath = CONFIG.resultDir + "/" + filter + "_integration.xisf";

  if (fileExists(outPath)) {
    log("  [" + filter + "] Integration already done");
    return;
  }

  var alignedFiles = findFiles(calDir, "*_c_abe_a_r.xisf");
  if (alignedFiles.length === 0) {
    log("  [" + filter + "] No aligned files for integration");
    return;
  }

  // Tableau 4 colonnes partagé probes + intégration finale
  var images = [];
  for (var i = 0; i < alignedFiles.length; i++) {
    var xdrzPath = alignedFiles[i].replace(".xisf", ".xdrz");
    images.push([true, alignedFiles[i], xdrzPath, ""]);
  }

  // ---- Sélection sigma ----
  var useSigmaLow, useSigmaHigh;

  if (CONFIG.autoSigma) {
    writeStatus("AUTOSIGMA_" + filter, "STARTED", { nImages: alignedFiles.length });
    var sigmaResult = findOptimalSigma(filter, images);
    useSigmaLow  = sigmaResult.sigmaLow;
    useSigmaHigh = sigmaResult.sigmaHigh;
    log("  [" + filter + "] Sigma optimal : low=" +
      useSigmaLow + "  high=" + useSigmaHigh);
    writeStatus("AUTOSIGMA_" + filter, "DONE",
      { sigmaLow: useSigmaLow, sigmaHigh: useSigmaHigh });
  } else {
    useSigmaLow  = CONFIG.sigmaLow;
    useSigmaHigh = CONFIG.sigmaHigh;
    log("  [" + filter + "] Sigma fixe : low=" +
      useSigmaLow + "  high=" + useSigmaHigh);
  }

  // ---- Intégration finale (drizzle ON + rejection maps ON pour contrôle) ----
  var ii = new ImageIntegration();
  ii.images                 = images;
  ii.combination            = ImageIntegration.prototype.Average;
  ii.weightMode             = ImageIntegration.prototype.KeywordWeight;
  ii.weightKeyword          = "SSWEIGHT";
  ii.weightScale            = ImageIntegration.prototype.WeightScale_BWMV;
  ii.minWeight              = 0.005;
  ii.normalization          = ImageIntegration.prototype.AdditiveWithScaling;
  ii.rejection              = ImageIntegration.prototype.SigmaClip;
  ii.rejectionNormalization = ImageIntegration.prototype.Scale;
  ii.sigmaLow               = useSigmaLow;
  ii.sigmaHigh              = useSigmaHigh;
  ii.clipLow                = true;
  ii.clipHigh               = true;
  ii.generateDrizzleData    = true;
  ii.generateIntegratedImage = true;
  ii.generateRejectionMaps  = true;  // rejection maps sauvegardées pour contrôle visuel

  // Snapshot des fenêtres ouvertes AVANT executeGlobal
  var idsBeforeInt = {};
  ImageWindow.windows.forEach(function(w) { idsBeforeInt[w.mainView.id] = true; });

  ii.executeGlobal();

  // ---- Sauvegarde stack + rejection maps ----
  var pathHigh = CONFIG.resultDir + "/" + filter + "_rejection_high.xisf";
  var pathLow  = CONFIG.resultDir + "/" + filter + "_rejection_low.xisf";

  // Identifier uniquement les nouvelles fenêtres créées par cette intégration
  // (évite les faux positifs sur des fenêtres pré-existantes nommées "integration")
  var allWinsAfterInt = ImageWindow.windows;
  var allIds = [];
  for (var wi = 0; wi < allWinsAfterInt.length; wi++) allIds.push(allWinsAfterInt[wi].mainView.id);
  log("  [" + filter + "] Fenêtres ouvertes après Integration: [" + allIds.join(", ") + "]");

  var intWin  = null, highWin = null, lowWin = null;
  for (var w = 0; w < allWinsAfterInt.length; w++) {
    var fw = allWinsAfterInt[w];
    if (idsBeforeInt[fw.mainView.id]) continue;  // fenêtre pré-existante
    var vid = fw.mainView.id.toLowerCase();
    if      (vid.indexOf("rejected_high") >= 0) { highWin = fw; }
    else if (vid.indexOf("rejected_low")  >= 0) { lowWin  = fw; }
    else                                         { intWin  = fw; }
  }

  // Sauvegarder puis fermer — allowOverwrite=true pour écrasement propre
  if (highWin) {
    var okH = highWin.saveAs(pathHigh, false, true, false, false);
    highWin.forceClose();
    if (okH) log("  [" + filter + "] Rejection high saved : " + pathHigh);
    else     log("  [" + filter + "] ERROR: saveAs rejection_high a échoué (id=" + highWin.mainView.id + ")");
  } else { log("  [" + filter + "] WARNING: rejection_high introuvable"); }

  if (lowWin) {
    var okL = lowWin.saveAs(pathLow, false, true, false, false);
    lowWin.forceClose();
    if (okL) log("  [" + filter + "] Rejection low  saved : " + pathLow);
    else     log("  [" + filter + "] ERROR: saveAs rejection_low a échoué (id=" + lowWin.mainView.id + ")");
  } else { log("  [" + filter + "] WARNING: rejection_low introuvable"); }

  if (intWin) {
    var okI = intWin.saveAs(outPath, false, true, false, false);
    intWin.forceClose();
    if (okI) log("  [" + filter + "] Integration saved    : " + outPath);
    else     log("  [" + filter + "] ERROR: saveAs integration a échoué (id=" + intWin.mainView.id + ")");
  } else { log("  [" + filter + "] WARNING: integration introuvable"); }

  closeAllWindows();
}

// ============================================================
// PHASE 7 : DrizzleIntegration 2×
// ============================================================

function runDrizzle(filter) {
  var calDir = CONFIG.rootDir + "/" + filter + "/calibrated";
  var outPath = CONFIG.resultDir + "/" + filter + "_drizzle_2x.xisf";

  if (fileExists(outPath)) {
    log("  [" + filter + "] Drizzle already done");
    return;
  }

  var xdrzFiles = findFiles(calDir, "*_c_abe_a_r.xdrz");
  if (xdrzFiles.length === 0) {
    log("  [" + filter + "] No .xdrz files for Drizzle");
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
  log("  [" + filter + "] Drizzle saved: " + outPath);
}

// ============================================================
// MAIN
// ============================================================

function main() {
  ensureDir(CONFIG.resultDir);
  writeStatus("INIT", "STARTED", { version: "1.4.0", config: CONFIG });

  // ---- Détection des filtres ----
  var filters = CONFIG.filters || detectFilters();
  if (filters.length === 0) {
    writeStatus("ERROR", "NO_FILTERS_DETECTED");
    log("ERREUR: aucun sous-dossier de filtre trouvé dans " + CONFIG.rootDir);
    return;
  }
  log("Filtres: " + filters.join(", "));

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

  // ---- Phase 3: SubframeSelector + Analyse nuits + SSWEIGHT ----
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
    log("ERREUR: Aucun fichier approuvé. Vérifier les données source.");
    return;
  }

  // ---- Sélection de la référence StarAlignment ----
  var refFile = null;
  if (bestFiles[CONFIG.preferredRefFilter] && bestFiles[CONFIG.preferredRefFilter].path) {
    refFile = bestFiles[CONFIG.preferredRefFilter].path;
  } else {
    for (var f = 0; f < filters.length; f++) {
      if (bestFiles[filters[f]] && bestFiles[filters[f]].path) {
        refFile = bestFiles[filters[f]].path;
        break;
      }
    }
  }
  if (!refFile && allApproved.length > 0) refFile = allApproved[0];
  log("Référence StarAlignment: " + (refFile ? File.extractName(refFile) : "N/A"));

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
    version:   "1.4.0",
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
      integration:    CONFIG.resultDir + "/" + filters[f] + "_integration.xisf",
      drizzle:        CONFIG.resultDir + "/" + filters[f] + "_drizzle_2x.xisf",
      rejectionHigh:  CONFIG.resultDir + "/" + filters[f] + "_rejection_high.xisf",
      rejectionLow:   CONFIG.resultDir + "/" + filters[f] + "_rejection_low.xisf"
    };
    // Ajouter les sigma optimaux s'ils ont été calculés
    var sigmaSearch = readJSON(CONFIG.resultDir + "/" + filters[f] + "_sigma_search.json");
    if (sigmaSearch) {
      report.results[filters[f]].sigmaOptimization = {
        sigmaLow:  sigmaSearch.bestSigmaLow,
        sigmaHigh: sigmaSearch.bestSigmaHigh,
        nProbes:   sigmaSearch.sweepHigh.length + sigmaSearch.sweepLow.length,
        bestMAD:   sigmaSearch.bestMAD_Low
      };
    }
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

  log("");
  log("╔══════════════════════════════════════╗");
  log("║   PIPELINE COMPLETE - " + filters.join("+") + "        ║");
  log("╚══════════════════════════════════════╝");
  log("Rapport: " + CONFIG.resultDir + "/pipeline_report.json");
}

// ---- Lancement ----
main();
