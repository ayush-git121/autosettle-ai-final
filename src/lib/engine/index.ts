import { ENGINE_CONFIG as C, type DamageType, type Part, type Severity } from "./config";

export * from "./config";

export interface Damage {
  part: Part;
  damageType: DamageType;
  severity: Severity;
  confidence: number;
  damageRatio: number;
  box: { x: number; y: number; w: number; h: number };
  reason: string;
  mediaId?: string;
}

export interface CostRow {
  part: string;
  action: "repair" | "replace";
  segment: string;
  parts_cost: number;
  labour_cost: number;
  paint_cost: number;
  material: string;
}

export interface LineItem {
  part: Part;
  damageType: DamageType;
  severity: Severity;
  action: "repair" | "replace";
  parts: number;
  labour: number;
  paint: number;
  depreciation: number;
  depreciationPct: number;
  total: number;
  rule: string;
}

export interface Estimate {
  segment: string;
  lines: LineItem[];
  parts: number;
  labour: number;
  paint: number;
  depreciation: number;
  total: number;
}

export function roundTo(n: number, step: number = C.roundTo) {
  return Math.round(n / step) * step;
}

export function severityFromRatio(ratio: number): Severity {
  if (ratio < 10) return "minor";
  if (ratio <= 30) return "moderate";
  return "severe";
}

export function severityAgrees(d: Pick<Damage, "severity" | "damageRatio">) {
  return severityFromRatio(d.damageRatio) === d.severity;
}

/** Same part detected on several photos is priced once (highest confidence kept). */
export function mergeDamages(damages: Damage[]): Damage[] {
  const byPart = new Map<string, Damage>();
  for (const d of damages) {
    const prev = byPart.get(d.part);
    if (!prev || d.confidence > prev.confidence) byPart.set(d.part, d);
  }
  return [...byPart.values()];
}

export function chooseAction(d: Pick<Damage, "severity" | "damageType">): { action: "repair" | "replace"; paint: boolean; rule: string } {
  if (d.severity === "severe" || ["crack", "shatter", "broken", "missing"].includes(d.damageType))
    return { action: "replace", paint: true, rule: "Severe, crack, shatter, broken or missing → replace" };
  if (d.damageType === "scratch" || d.damageType === "paint_loss")
    return { action: "repair", paint: true, rule: "Scratch / paint loss → repair + paint" };
  if (d.damageType === "dent" && d.severity === "moderate")
    return { action: "repair", paint: true, rule: "Moderate dent → repair (with refinish)" };
  return { action: "repair", paint: true, rule: "Minor dent → repair (with refinish)" };
}

export function depreciationPct(material: string, vehicleAgeYears: number, zeroDep: boolean) {
  if (zeroDep) return 0;
  if (material === "glass") return C.depreciation.glass;
  if (material === "plastic" || material === "rubber") return C.depreciation.plastic;
  const band = C.depreciation.metalByAge.find((b) => vehicleAgeYears <= b.maxYears)!;
  return band.pct;
}

export function priceDamages(
  damages: Damage[],
  rows: CostRow[],
  opts: { segment: string; vehicleAgeYears: number; zeroDep: boolean },
): Estimate {
  const lines: LineItem[] = damages.map((d) => {
    const choice = chooseAction(d);
    const row =
      rows.find((r) => r.part === d.part && r.action === choice.action && r.segment === opts.segment) ??
      rows.find((r) => r.part === "other" && r.action === choice.action && r.segment === opts.segment);
    if (!row) throw new Error(`No reference price for ${d.part}/${choice.action}/${opts.segment}`);
    const parts = row.parts_cost;
    const labour = row.labour_cost;
    const paint = choice.paint ? row.paint_cost : 0;
    const pct = choice.action === "replace" ? depreciationPct(row.material, opts.vehicleAgeYears, opts.zeroDep) : 0;
    const depreciation = Math.round(parts * pct);
    return {
      part: d.part, damageType: d.damageType, severity: d.severity, action: choice.action,
      parts, labour, paint, depreciation, depreciationPct: pct,
      total: parts + labour + paint - depreciation, rule: choice.rule,
    };
  });
  const sum = (k: keyof LineItem) => lines.reduce((a, l) => a + (l[k] as number), 0);
  return {
    segment: opts.segment, lines,
    parts: sum("parts"), labour: sum("labour"), paint: sum("paint"), depreciation: sum("depreciation"),
    total: sum("total"),
  };
}

export function settlementLimits(estimate: number) {
  return { floor: roundTo(estimate * C.floorPct), ceiling: roundTo(estimate * C.ceilingPct) };
}

// ---------- Negotiation ----------
export type NegotiationAction = "offer" | "accept" | "hold" | "escalate";

export interface NegotiationState {
  currentOffer: number;
  round: number; // rounds of countering done so far
  floor: number;
  ceiling: number;
  estimate: number;
}

export interface NegotiationDecision {
  action: NegotiationAction;
  amount: number;
  round: number;
  rule: string;
}

export function nextAllowedOffer(s: NegotiationState) {
  return Math.min(s.currentOffer + C.stepPerRound, s.ceiling);
}

/** Pure decision: code decides the money. counter = null means "customer accepts current offer". */
export function decide(s: NegotiationState, counter: number | null): NegotiationDecision {
  if (counter === null) return { action: "accept", amount: s.currentOffer, round: s.round, rule: "Customer accepted current offer" };
  if (counter <= s.currentOffer)
    return { action: "accept", amount: s.currentOffer, round: s.round, rule: "Counter at or below current offer → settle at current offer" };
  const round = s.round + 1;
  const next = nextAllowedOffer(s);
  if (counter <= next) return { action: "accept", amount: counter, round, rule: "Counter within next allowed offer → accept customer's number" };
  if (round >= C.maxRounds && counter > next)
    return { action: "escalate", amount: next, round, rule: `Round ${C.maxRounds} reached without agreement → human adjuster` };
  if (counter > s.estimate * C.farAboveEstimateFactor)
    return { action: "escalate", amount: s.currentOffer, round, rule: "Customer counter far above the estimate → human adjuster" };
  if (counter > s.ceiling) return { action: "hold", amount: next, round, rule: "Counter above ceiling → hold at next allowed offer" };
  return { action: "offer", amount: next, round, rule: "Raise offer by step, capped at ceiling" };
}

// ---------- Manipulation guard (runs BEFORE the model) ----------
const MANIP_WORDS = /\b(ignore|approve|approved|system|override|instructions?|prompt|jailbreak|developer mode|admin)\b/i;
export function detectManipulation(text: string): { flagged: boolean; reason?: string } {
  if (MANIP_WORDS.test(text)) return { flagged: true, reason: "Instruction-style wording in customer message" };
  if (/\b(pay|give|set|transfer|sanction)\b[^.]{0,20}(₹|rs\.?|inr)?\s?\d/i.test(text))
    return { flagged: true, reason: "Instruction-style rupee demand" };
  return { flagged: false };
}

/** Parse a rupee amount out of free customer text ("25k", "₹25,000", "25000"). */
export function parseAmount(text: string): number | null {
  const t = text.replace(/,/g, "");
  const m = t.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(k|thousand|hazaar|hazar|lakh|l)?\b/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const unit = (m[2] || "").toLowerCase();
  if (unit === "k" || unit === "thousand" || unit.startsWith("haz")) n *= 1000;
  if (unit === "lakh" || unit === "l") n *= 100000;
  if (n < 100) return null;
  return Math.round(n);
}

export function isAcceptance(text: string) {
  return /\b(accept|agreed?|ok(ay)?|deal|done|theek hai|thik hai|chalega|haan|yes|fine)\b/i.test(text) && parseAmount(text) === null;
}

/** Every rupee figure in the model reply must equal the engine amount. */
export function replyAmountsValid(reply: string, amount: number) {
  const nums = [...reply.replace(/,/g, "").matchAll(/(?:₹|rs\.?\s?|inr\s?)(\d+)/gi)].map((m) => Number(m[1]));
  const bare = [...reply.replace(/,/g, "").matchAll(/\b(\d{4,})\b/g)].map((m) => Number(m[1]));
  const all = [...nums, ...bare];
  return all.length > 0 && all.every((n) => n === amount);
}

export function formatINR(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export function priorityFor(reasons: string[]) {
  if (reasons.some((r) => /reused|edited|manipulation|mismatch/i.test(r))) return "high";
  if (reasons.some((r) => /severe|above threshold/i.test(r))) return "medium";
  return "normal";
}
