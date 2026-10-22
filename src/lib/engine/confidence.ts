import { ENGINE_CONFIG as C } from "./config";
import type { Damage } from "./index";
import { severityFromRatio } from "./index";

const LEVELS = ["minor", "moderate", "severe"] as const;
/** 0 = agree, 1 = adjacent bands, 2 = minor vs severe. */
export function severityGap(d: Pick<Damage, "severity" | "damageRatio">) {
  return Math.abs(LEVELS.indexOf(d.severity) - LEVELS.indexOf(severityFromRatio(d.damageRatio)));
}

export interface ConfidenceInput {
  damages: Damage[]; // merged, one per part
  photoConfidences: number[]; // per car photo
  qualityIssuePhotos: number;
  failedPhotos: number; // photos where the model call failed
  nonCarPhotos: number;
  softSignals: string[]; // e.g. capture date somewhat far from incident
  vehicleMismatch: boolean;
  estimateTotal: number | null;
  yolo: { enabled: boolean; agreed: number; unconfirmed: number; extra: number };
  hardReasons: string[]; // reused/edited image, far capture date, ...
}

export interface ConfidenceFactor { label: string; delta: number; reason?: string }
export interface ConfidenceResult {
  score: number;
  level: "high" | "medium" | "low";
  autoProceed: boolean;
  hardReasons: string[];
  reviewReasons: string[]; // only filled when autoProceed is false
  factors: ConfidenceFactor[];
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/** Pure routing decision: proceed to offer only when the AI is confident and no hard rule fires. */
export function assessConfidence(i: ConfidenceInput): ConfidenceResult {
  const factors: ConfidenceFactor[] = [];
  const hard = [...i.hardReasons];

  // Routing is based ONLY on the model's own damage confidence (plus hard fraud/size rules below).
  const damageConf = mean(i.damages.map((d) => d.confidence));
  const photoConf = mean(i.photoConfidences);
  let score = damageConf;
  factors.push({ label: `Model damage confidence ${Math.round(damageConf * 100)}% (photo clarity ${Math.round(photoConf * 100)}%)`, delta: score });

  if (i.estimateTotal !== null && i.estimateTotal > C.escalateEstimateAbove) hard.push("Estimate above threshold");

  score = clamp(score);
  const belowScore = score < C.autoProceedScore;
  const autoProceed = hard.length === 0 && !belowScore && i.damages.length > 0;
  const level = score >= C.autoProceedScore ? "high" : "low";

  const reviewReasons: string[] = [];
  if (!autoProceed) {
    if (belowScore) reviewReasons.push(`AI confidence ${Math.round(score * 100)}% is below the ${Math.round(C.autoProceedScore * 100)}% needed for an automatic offer`);
    for (const f of factors) if (f.reason && f.delta < 0) reviewReasons.push(f.reason);
  }
  return { score, level, autoProceed, hardReasons: [...new Set(hard)], reviewReasons: [...new Set(reviewReasons)], factors };
}