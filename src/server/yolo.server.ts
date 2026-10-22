// Server-only: OPTIONAL second detector (YOLO) used to cross-check the vision model.
// Configure YOLO_API_URL (and YOLO_API_KEY if needed). Works with a Roboflow hosted model
// or the bundled yolo-service/ (Ultralytics). If not configured, it is simply skipped.
import type { YoloBox } from "@/lib/engine/crosscheck";

export const yoloEnabled = () => !!process.env.YOLO_API_URL;

interface RoboflowResponse {
  image?: { width: number; height: number };
  predictions?: { x: number; y: number; width: number; height: number; confidence: number; class: string }[];
}

/** Parse Roboflow-style output (centre x/y + width/height in pixels) into normalized top-left boxes. */
export function parseYolo(r: RoboflowResponse): YoloBox[] {
  const W = r.image?.width, H = r.image?.height;
  if (!W || !H) return [];
  const c = (n: number) => Math.max(0, Math.min(1, n));
  return (r.predictions ?? []).map((p) => ({
    label: p.class, confidence: p.confidence,
    box: { x: c((p.x - p.width / 2) / W), y: c((p.y - p.height / 2) / H), w: c(p.width / W), h: c(p.height / H) },
  }));
}

export async function detectWithYolo(base64: string): Promise<YoloBox[]> {
  const base = process.env.YOLO_API_URL;
  if (!base) return [];
  const url = new URL(base);
  if (process.env.YOLO_API_KEY && !url.searchParams.has("api_key")) url.searchParams.set("api_key", process.env.YOLO_API_KEY);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: base64,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`YOLO error ${res.status}`);
  return parseYolo((await res.json()) as RoboflowResponse);
}
