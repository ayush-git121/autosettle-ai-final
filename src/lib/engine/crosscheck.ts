import type { Damage } from "./index";
import type { DamageType } from "./config";

export interface Box { x: number; y: number; w: number; h: number }
export interface YoloBox { label: string; confidence: number; box: Box }

export function iou(a: Box, b: Box) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const uni = a.w * a.h + b.w * b.h - inter;
  return uni > 0 ? inter / uni : 0;
}
const centreIn = (a: Box, b: Box) => { const cx = a.x + a.w / 2, cy = a.y + a.h / 2; return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h; };

/** Map labels from common car-damage YOLO datasets onto our damage types. */
export function mapYoloLabel(label: string): DamageType | null {
  const l = label.toLowerCase();
  if (/scratch|scuff|abrasion/.test(l)) return "scratch";
  if (/dent|crumple|deform/.test(l)) return "dent";
  if (/shatter|smash/.test(l)) return "shatter";
  if (/crack/.test(l)) return "crack";
  if (/paint|rust/.test(l)) return "paint_loss";
  if (/missing/.test(l)) return "missing";
  if (/broken|lamp|glass|damage|bumper|door|hood/.test(l)) return "broken";
  return null;
}

export interface CrossCheck { damages: Damage[]; agreed: number; unconfirmed: number; extra: number }

/** Compare VLM damages with YOLO boxes on ONE photo. Agreement raises confidence and snaps the box to YOLO's tighter box. */
export function crossCheck(damages: Damage[], yolo: YoloBox[], minYolo = 0.35): CrossCheck {
  const boxes = yolo.filter((y) => y.confidence >= minYolo);
  const used = new Set<number>();
  let agreed = 0;
  const out = damages.map((d) => {
    let best = -1, bestScore = 0;
    boxes.forEach((y, idx) => {
      const s = iou(d.box, y.box) || (centreIn(y.box, d.box) || centreIn(d.box, y.box) ? 0.1 : 0);
      if (s > bestScore) { bestScore = s; best = idx; }
    });
    if (best < 0 || bestScore < 0.1) return d;
    used.add(best);
    agreed++;
    const y = boxes[best];
    return {
      ...d,
      confidence: Math.min(0.98, d.confidence + 0.1 * y.confidence),
      box: bestScore >= 0.3 ? y.box : d.box,
      reason: `${d.reason} (confirmed by YOLO ${y.label} ${Math.round(y.confidence * 100)}%)`,
    };
  });
  return { damages: out, agreed, unconfirmed: damages.length - agreed, extra: boxes.length - used.size };
}
