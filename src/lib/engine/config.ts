// All values are ASSUMPTIONS for the prototype and are labelled as such in the UI.
export const ENGINE_CONFIG = {
  floorPct: 0.7,
  ceilingPct: 0.9,
  roundTo: 100,
  stepPerRound: 500,
  maxRounds: 3,
  maxClaimsPerYear: 2,
  maxVerifyFailures: 3,
  // Confidence-based routing: only uncertain claims go to a human adjuster.
  autoProceedScore: 0.85, // model damage confidence needed to go straight to a cash offer (below = human adjuster)
  minDamageConfidence: 0.5, // any single damage below this is too uncertain to price
  maxDamagedParts: 3, // more than this lowers confidence (complex claim)
  escalateEstimateAbove: 150000, // hard rule: large claims always get a human
  captureDateSoftDays: 30, // photo taken this far from incident: confidence penalty
  captureDateHardDays: 365, // photo taken this far from incident: escalate
  farAboveEstimateFactor: 2,
  maxModelCallsPerClaim: 14,
  // Depreciation (only on replaced parts). Assumptions, IRDAI-style bands.
  depreciation: {
    glass: 0,
    plastic: 0.5,
    rubber: 0.5,
    metalByAge: [
      { maxYears: 0.5, pct: 0 },
      { maxYears: 1, pct: 0.05 },
      { maxYears: 2, pct: 0.1 },
      { maxYears: 3, pct: 0.15 },
      { maxYears: 4, pct: 0.25 },
      { maxYears: 5, pct: 0.35 },
      { maxYears: 10, pct: 0.4 },
      { maxYears: 999, pct: 0.5 },
    ],
  },
} as const;

export const PARTS = [
  "front_bumper", "rear_bumper", "hood", "front_door", "rear_door", "fender", "roof", "boot",
  "windshield", "rear_windshield", "headlight", "taillight", "side_mirror", "quarter_panel", "other",
] as const;
export const DAMAGE_TYPES = ["scratch", "dent", "crack", "shatter", "paint_loss", "broken", "missing"] as const;
export const SEVERITIES = ["minor", "moderate", "severe"] as const;

export type Part = (typeof PARTS)[number];
export type DamageType = (typeof DAMAGE_TYPES)[number];
export type Severity = (typeof SEVERITIES)[number];