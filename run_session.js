// ============================================================
// LAUNCHER GÉNÉRIQUE — à utiliser pour toute nouvelle session
// Une seule ligne à modifier : ROOTDIR
// ============================================================
//
// USAGE dans PixInsight console :
//   eval(File.readTextFile("C:/astro-pipeline/run_session.js"))
//
// OU depuis Claude Code (run_script MCP) :
//   eval(File.readTextFile("C:/astro-pipeline/run_session.js"))
// ============================================================

// ▼▼▼ SEULE LIGNE À MODIFIER ▼▼▼
var ROOTDIR = "D:/Rosette";
// ▲▲▲ SEULE LIGNE À MODIFIER ▲▲▲

// Tout le reste est automatique :
// - Filtres     : auto-détectés (sous-dossiers B/G/R/L/H/S/O/V)
// - DOF masters : auto-matchés  (temp + exposition lus dans les noms de fichiers)
// - resultDir   : ROOTDIR/result
// - subframeScale: 2.26 arcsec/px (ARO)
// - autoSigma   : true (recherche sigma optimal par descente de coordonnées)
// - preferredRefFilter: H si présent, sinon R, sinon premier filtre détecté

var CONFIG = {
  rootDir:            ROOTDIR,
  resultDir:          ROOTDIR + "/result",
  dofDir:             "D:/Terrapixa Dropbox/clement ver eecke/ARO/PIX",

  filters:            null,   // auto-détection

  doCalibration:      true,
  doABE:              true,
  doSubframe:         true,
  doAlign:            true,
  doIntegration:      true,
  doDrizzle:          true,

  sigmaLow:           4.0,    // utilisé si autoSigma = false
  sigmaHigh:          3.0,

  autoSigma:          true,
  autoSigmaHighRange: [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0],
  autoSigmaLowRange:  [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5],

  drizzleScale:       2.0,
  drizzleDropShrink:  0.90,

  wSNR:               1.0,
  wFWHM:              1.2,
  wStars:             1.0,
  wNoise:             0.8,
  iqrMult:            1.5,

  rejectBadNights:    true,
  nightIqrMult:       1.5,
  minNightSize:       3,

  debugColumns:       false,
  noiseColIdx:        10,

  subframeScale:      1.84,

  // Référence StarAlignment : H > R > premier filtre détecté
  // (le pipeline choisit automatiquement si le filtre préféré est absent)
  preferredRefFilter: "H",
};

eval(File.readTextFile("C:/astro-pipeline/pipeline_v130.js"));
