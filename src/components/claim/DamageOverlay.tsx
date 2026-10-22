import { partLabel } from "./ui";

interface Det {
  isCarPresent: boolean;
  damages: { part: string; severity: string; box: { x: number; y: number; w: number; h: number } }[];
}
const STROKE: Record<string, string> = { minor: "border-teal-light", moderate: "border-amber", severe: "border-destructive" };

export function DamageOverlay({ url, detection, alt }: { url: string; detection: Det | null; alt: string }) {
  return (
    <figure className="relative overflow-hidden rounded-xl border bg-muted">
      <img src={url} alt={alt} className="block h-auto w-full" />
      {detection?.damages.map((d, i) => (
        <div key={i} className={`absolute rounded-md border-2 ${STROKE[d.severity] ?? "border-teal-light"}`}
          style={{ left: `${d.box.x * 100}%`, top: `${d.box.y * 100}%`, width: `${d.box.w * 100}%`, height: `${d.box.h * 100}%` }}>
          <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-navy px-1.5 py-0.5 text-[11px] text-navy-foreground">
            {i + 1}. {partLabel(d.part)} · {d.severity}
          </span>
        </div>
      ))}
      {detection && !detection.isCarPresent && (
        <figcaption className="absolute inset-x-0 bottom-0 bg-navy/85 px-3 py-2 text-sm text-navy-foreground">No car detected in this photo</figcaption>
      )}
    </figure>
  );
}

export function OverlayLegend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      {[["minor", "Minor"], ["moderate", "Moderate"], ["severe", "Severe"]].map(([k, l]) => (
        <span key={k} className="flex items-center gap-1.5"><span className={`size-3 rounded-sm border-2 ${STROKE[k]}`} aria-hidden />{l}</span>
      ))}
    </div>
  );
}
