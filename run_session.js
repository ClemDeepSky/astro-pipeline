// Session Rosette2 HSO — D:\Rosette2 — 2026-03-12
var ROOTDIR = "D:/Rosette2";

var CONFIG = {
  rootDir:            ROOTDIR,
  resultDir:          ROOTDIR + "/result",
  dofDir:             "D:/Terrapixa Dropbox/clement ver eecke/ARO/PIX",

  filters:            ["H", "O", "S"],

  doCalibration:      true,
  doABE:              true,
  doSubframe:         true,
  doAlign:            true,
  doIntegration:      true,
  doDrizzle:          true,

  sigmaLow:           4.0,
  sigmaHigh:          3.0,

  autoSigma:          true,
  autoSigmaMode:      "A",      // "A" = sigmaLow fixé à 4.0 / "B" = sigmaLow = sigmaHigh+1
  autoSigmaTargetHigh: 0.05,    // % cible rejHighPercent
  autoSigmaHighTol:   0.01,     // % tolérance ±
  autoSigmaMaxLow:    2.0,      // % max rejLowPercent acceptable
  autoSigmaWH:        10.0,     // poids rejHigh dans score (>> wL)
  autoSigmaWL:        1.0,      // poids pénalité rejLow dans score
  autoSigmaMaxIter:   15,       // max probes au total (5 calibration + 10 bisection)

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

  saveProbes:         true,

  debugColumns:       false,
  noiseColIdx:        10,

  subframeScale:      1.84,
  preferredRefFilter: "H",
};

eval(File.readTextFile("C:/astro-pipeline/pipeline_v130.js"));
