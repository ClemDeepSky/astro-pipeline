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

// Session Rosette Ha — E:\Rosette — 2026-03-12
// Tri restrictif SNR (présence lune sur une partie du set)
var ROOTDIR = "E:/Rosette";

var CONFIG = {
  rootDir:            ROOTDIR,
  resultDir:          ROOTDIR + "/result",
  dofDir:             "D:/Terrapixa Dropbox/clement ver eecke/ARO/PIX",

  filters:            ["H"],   // filtre unique

  doCalibration:      true,
  doABE:              true,
  doSubframe:         true,
  doAlign:            true,
  doIntegration:      true,
  doDrizzle:          true,

  sigmaLow:           4.0,
  sigmaHigh:          3.0,

  // Sigma plafonné à 3.0 → rejet plus strict
  autoSigma:          true,
  autoSigmaHighRange: [1.5, 2.0, 2.5, 3.0],
  autoSigmaLowRange:  [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5],

  drizzleScale:       2.0,
  drizzleDropShrink:  0.90,

  // SNR doublé (lune dégrade le rapport signal/bruit)
  wSNR:               2.0,
  wFWHM:              1.2,
  wStars:             1.0,
  wNoise:             0.8,
  iqrMult:            1.5,

  // Rejet inter-nuits actif (détecte les nuits lunaires)
  rejectBadNights:    true,
  nightIqrMult:       1.5,
  minNightSize:       3,

  // Sauvegarde de chaque probe autoSigma (stack + rejection maps) dans result/probes/
  saveProbes:         true,

  debugColumns:       false,
  noiseColIdx:        10,

  subframeScale:      1.84,
  preferredRefFilter: "H",
};

eval(File.readTextFile("C:/astro-pipeline/pipeline_v130.js"));
