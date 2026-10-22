import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, BadgeCheck, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, money, Shell, Steps } from "@/components/claim/ui";
import { api } from "@/services/api";

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [
      { title: "Verify your policy — Auto-Settle AI" },
      { name: "description", content: "Verify your motor policy with policy number, vehicle registration and registered mobile." },
      { property: "og:title", content: "Verify your policy — Auto-Settle AI" },
      { property: "og:description", content: "Start a minor motor damage claim." },
    ],
  }),
  component: Verify,
});

type Result = Awaited<ReturnType<typeof api.verifyPolicy>>;
const today = () => new Date().toISOString().slice(0, 10);

const TEST = [
  ["DEMO-1001", "UP65AB1234", "Maruti Swift 2021", "Comprehensive, active, zero-dep"],
  ["DEMO-1002", "UP65CD5678", "Hyundai i20 2019", "Expired 2025-12-31"],
  ["DEMO-1003", "UP32EF9012", "Tata Nexon 2022", "Third-party only"],
  ["DEMO-1004", "DL8CGH3456", "Honda City 2018", "Comprehensive, active"],
  ["DEMO-1005", "MH12JK7890", "Kia Seltos 2023", "2 claims this year (limit)"],
];

function Verify() {
  const nav = useNavigate();
  const [f, setF] = useState({ policyNumber: "", registration: "", mobile: "", incidentDate: today() });
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { setRes(await api.verifyPolicy(f)); } catch (err) { setRes({ result: "failed", message: (err as Error).message, attemptsLeft: 0 } as Result); }
    finally { setBusy(false); }
  };

  return (
    <Shell>
      <Steps current={0} />
      <h1 className="text-3xl font-semibold">Verify your policy</h1>
      <p className="mt-1 text-muted-foreground">We check your details against the policy record.</p>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_320px]">
        {res?.result === "verified" ? (
          <Card>
            <div className="flex items-center gap-2 text-teal"><BadgeCheck className="size-5" aria-hidden /><span className="font-medium">Policy verified</span></div>
            <h2 className="mt-3 text-2xl font-semibold">{res.vehicle.make} {res.vehicle.model} · {res.vehicle.year}</h2>
            <p className="text-muted-foreground">{res.vehicle.registration}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted-foreground">IDV</dt><dd className="font-medium">{money(res.idv)}</dd></div>
              <div><dt className="text-muted-foreground">Cover</dt><dd className="font-medium capitalize">{res.coverType}</dd></div>
            </dl>
            {res.zeroDep && <span className="mt-4 inline-flex rounded-full bg-teal-soft px-2.5 py-1 text-xs font-medium text-teal">Zero depreciation add-on</span>}
            <Button className="mt-6 w-full" onClick={() => nav({ to: "/claims/$id/upload", params: { id: res.claimId } })}>Continue to upload</Button>
          </Card>
        ) : res?.result === "review" ? (
          <Card>
            <div className="flex items-center gap-2 text-amber-foreground"><AlertTriangle className="size-5" aria-hidden /><span className="font-medium">A human adjuster needs to review this claim</span></div>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">{res.failedChecks.map((c) => <li key={c}>{c}</li>)}</ul>
            <p className="mt-4 text-sm text-muted-foreground">Your claim has been created and added to the adjuster queue. They will contact you on your registered mobile.</p>
            <Button asChild variant="outline" className="mt-6"><Link to="/claims/$id/audit" params={{ id: res.claimId }}>View audit trail</Link></Button>
          </Card>
        ) : res?.result === "locked" ? (
          <Card><p className="font-medium">Please contact support.</p><p className="mt-1 text-sm text-muted-foreground">Too many failed attempts.</p></Card>
        ) : (
          <Card>
            <form onSubmit={submit} className="space-y-4">
              {([
                ["policyNumber", "Policy number", "DEMO-1001"],
                ["registration", "Vehicle registration number", "UP65AB1234"],
                ["mobile", "Registered mobile number", "9000000000"],
              ] as const).map(([k, l, ph]) => (
                <div key={k} className="space-y-1.5">
                  <Label htmlFor={k}>{l}</Label>
                  <Input id={k} required placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label htmlFor="date">Date of incident</Label>
                <Input id="date" type="date" required max={today()} value={f.incidentDate} onChange={(e) => setF({ ...f, incidentDate: e.target.value })} />
              </div>
              {res?.result === "failed" && (
                <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">
                  {res.message} {res.attemptsLeft > 0 && `(${res.attemptsLeft} attempt${res.attemptsLeft > 1 ? "s" : ""} left)`}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "Checking…" : "Verify policy"}</Button>
            </form>
          </Card>
        )}

        <Collapsible className="card-surface h-fit p-4">
          <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium">
            Test policies <ChevronDown className="size-4" aria-hidden />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-3 text-xs">
            <p className="text-muted-foreground">Mobile for all: 9000000000</p>
            {TEST.map(([p, r, v, n]) => (
              <button key={p} type="button" className="block w-full rounded-lg border bg-background p-2 text-left hover:border-teal"
                onClick={() => { setRes(null); setF({ ...f, policyNumber: p, registration: r, mobile: "9000000000" }); }}>
                <span className="font-mono font-medium">{p}</span> · <span className="font-mono">{r}</span>
                <span className="block text-muted-foreground">{v} — {n}</span>
              </button>
            ))}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </Shell>
  );
}
