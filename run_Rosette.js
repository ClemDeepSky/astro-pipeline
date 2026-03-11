// ============================================================
// Launcher — Rosette Nebula SHO 300s
// Session : H(98) + O(57) + S(80) = 235 bruts à ~-10°C
// Pipeline v1.4.0 (autoSigma ON)
// ============================================================

var ROOTDIR = "D:/Rosette";

var CONFIG = {
  rootDir:            ROOTDIR,
  resultDir:          ROOTDIR + "/result",
  dofDir:             "D:/Terrapixa Dropbox/clement ver eecke/ARO/PIX",

  filters:            null,

  doCalibration:      true,
  doABE:              true,
  doSubframe:         true,
  doAlign:            true,
  doIntegration:      true,
  doDrizzle:          true,

  sigmaLow:           4.0,
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

  subframeScale:      2.26,
  preferredRefFilter: "H",
};

eval(File.readTextFile("C:/astro-pipeline/pipeline_v130.js"));
