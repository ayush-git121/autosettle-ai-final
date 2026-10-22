import { Link } from "@tanstack/react-router";
import { Check, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/engine";

export const money = formatINR;

export function Shell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col">
      <div role="note" className="bg-amber-soft px-4 py-2 text-center text-xs text-amber-foreground">
        Prototype. Seeded test policies only. Estimates are indicative, not a binding insurance decision.
      </div>
      <header className="border-b bg-card/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-serif text-lg font-semibold">
            <span className="grid size-8 place-items-center rounded-lg bg-navy text-navy-foreground"><ShieldCheck className="size-4" aria-hidden /></span>
            Auto-Settle AI
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/verify" className="hover:text-foreground">Start a claim</Link>
            <Link to="/adjuster" className="hover:text-foreground">Adjuster</Link>
          </nav>
        </div>
      </header>
      <main className={cn("mx-auto w-full flex-1 px-4 py-8", wide ? "max-w-6xl" : "max-w-4xl")}>{children}</main>
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        Every decision is logged and explainable. <span className="font-medium text-foreground">AI perceives and talks. Code decides the money.</span>
      </footer>
    </div>
  );
}

const STEPS = ["Verify", "Upload", "Result", "Negotiate", "Done"] as const;
export function Steps({ current }: { current: number }) {
  return (
    <ol className="mb-8 flex flex-wrap items-center gap-2 text-sm" aria-label="Claim progress">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2" aria-current={i === current ? "step" : undefined}>
          <span className={cn("grid size-6 place-items-center rounded-full border text-xs font-medium",
            i < current && "border-teal bg-teal text-primary-foreground",
            i === current && "border-navy bg-navy text-navy-foreground",
            i > current && "bg-card text-muted-foreground")}>
            {i < current ? <Check className="size-3.5" aria-hidden /> : i + 1}
          </span>
          <span className={cn(i === current ? "font-medium text-foreground" : "text-muted-foreground")}>{s}</span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

const SEV: Record<string, string> = {
  minor: "bg-teal-soft text-teal border-teal/30",
  moderate: "bg-amber-soft text-amber-foreground border-amber/40",
  severe: "bg-danger-soft text-destructive border-destructive/30",
};
export function SeverityBadge({ severity }: { severity: string }) {
  return <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize", SEV[severity])}>{severity}</span>;
}

const STATUS: Record<string, [string, string]> = {
  verified: ["Verified", SEV.minor], uploading: ["Uploading", "bg-muted text-foreground border-border"],
  assessing: ["Assessing", "bg-muted text-foreground border-border"], assessed: ["Assessed", SEV.minor],
  negotiating: ["Negotiating", "bg-accent text-navy border-teal/30"], settled: ["Settled", "bg-teal text-primary-foreground border-teal"],
  escalated: ["With adjuster", SEV.moderate], more_photos_requested: ["More photos requested", SEV.moderate],
  closed: ["Closed", "bg-muted text-muted-foreground border-border"],
};
export function StatusBadge({ status }: { status: string }) {
  const [label, cls] = STATUS[status] ?? [status, "bg-muted border-border"];
  return <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium", cls)}>{label}</span>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("card-surface p-5", className)}>{children}</section>;
}

export const partLabel = (p: string) => p.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function EngineBadge() {
  return (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-0.5 text-[11px] font-medium text-teal">
      <ShieldCheck className="size-3" aria-hidden /> Amount approved by policy engine
    </span>
  );
}
