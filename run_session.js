// Session Rosette3 — D:\Rosette 3 — Test autoSigma v2.1 — H only, no drizzle
var ROOTDIR = "D:/Rosette 3";
var CONFIG = {
  rootDir:       ROOTDIR,
  resultDir:     ROOTDIR + "/result",
  dofDir:        "D:/Terrapixa Dropbox/clement ver eecke/ARO/PIX",

  filters:       ["H"],

  doCalibration: false,
  doABE:         false,
  doSubframe:    false,
  doAlign:       false,
  doIntegration: true,
  doDrizzle:     false,

  sigmaLow:      4.0,
  sigmaHigh:     3.0,

  autoSigma:          true,
  autoSigmaMode:      "A",
  autoSigmaTargetHigh: 0.05,
  autoSigmaHighTol:   0.01,
  autoSigmaMaxLow:    2.0,
  autoSigmaWH:        10.0,
  autoSigmaWL:        1.0,
  autoSigmaMaxIter:   20,

  drizzleScale:      2.0,
  drizzleDropShrink: 0.90,

  wSNR: 1.0, wFWHM: 1.2, wStars: 1.0, wNoise: 0.8, iqrMult: 1.5,
  rejectBadNights: true, nightIqrMult: 1.5, minNightSize: 3,

  saveProbes:    false,
  debugColumns:  false,
  noiseColIdx:   10,

  subframeScale:      1.84,
  preferredRefFilter: "H",
};

eval(File.readTextFile("C:/astro-pipeline/pipeline_v130.js"));
