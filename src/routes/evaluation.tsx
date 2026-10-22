import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Shell } from "@/components/claim/ui";
import { api } from "@/services/api";

export const Route = createFileRoute("/evaluation")({ component: Evaluation });
type Stats = { total: number; settled: number; escalated: number; closed: number; negotiating: number; avgSettlementToEstimate: number | null; reasons: [string, number][] };
function Evaluation() {
  const [stats, setStats] = useState<Stats | null>(null); const [error, setError] = useState("");
  useEffect(() => { api.evaluation().then(setStats).catch((e) => setError((e as Error).message)); }, []);
  const tiles = stats ? [["Claims recorded", stats.total], ["Settled", stats.settled], ["With adjuster", stats.escalated], ["Negotiating", stats.negotiating], ["Closed", stats.closed]] as [string, number][] : [];
  return <Shell><div className="flex items-center gap-3"><BarChart3 className="size-8 text-teal"/><div><h1 className="text-3xl font-semibold">Evaluation dashboard</h1><p className="text-sm text-muted-foreground">Computed from stored claims. Prototype sample data only.</p></div></div>
    {error && <p role="alert" className="mt-5 text-sm text-destructive">{error}</p>}{!stats && !error && <p className="mt-5">Loading claim statistics…</p>}
    {stats && <><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{tiles.map(([label, value]) => <Card key={label}><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></Card>)}</div><Card className="mt-5"><h2 className="font-semibold">Average settlement vs estimate</h2><p className="mt-2 text-2xl font-semibold">{stats.avgSettlementToEstimate == null ? "Not enough settled claims" : `${(stats.avgSettlementToEstimate * 100).toFixed(1)}%`}</p><p className="mt-1 text-sm text-muted-foreground">Mean ratio across claims with both a settlement amount and estimate. This is descriptive, not a performance guarantee.</p></Card><Card className="mt-5"><h2 className="font-semibold">Escalation reasons</h2>{stats.reasons.length ? <ol className="mt-3 space-y-3">{stats.reasons.map(([reason, count]) => <li key={reason}><div className="flex justify-between gap-3 text-sm"><span>{reason}</span><strong>{count}</strong></div><div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-teal" style={{ width: `${Math.min(100, count / Math.max(1, stats.reasons[0][1]) * 100)}%` }}/></div></li>)}</ol> : <p className="mt-2 text-sm text-muted-foreground">No escalation reasons recorded yet.</p>}</Card></>}
    <Button asChild variant="outline" className="mt-5"><Link to="/"><ArrowLeft className="mr-2 size-4"/>Back home</Link></Button>
  </Shell>;
}
