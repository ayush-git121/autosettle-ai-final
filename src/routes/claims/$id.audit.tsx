import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Shell, StatusBadge } from "@/components/claim/ui";
import { api } from "@/services/api";

export const Route = createFileRoute("/claims/$id/audit")({ component: AuditTrail });
type AuditData = { reference?: string; status?: string; entries: { id: string | number; actor: string; step: string; input_summary?: string | null; output_summary?: string | null; rule?: string | null; confidence?: number | null; created_at?: string }[] };
function AuditTrail() {
  const { id } = Route.useParams(); const [data, setData] = useState<AuditData | null>(null); const [error, setError] = useState(""); const [actor, setActor] = useState("all");
  useEffect(() => { api.getAudit(id).then(setData).catch((e) => setError((e as Error).message)); }, [id]);
  function download() { if (!data) return; const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `audit-${data.reference ?? id}.json`; a.click(); URL.revokeObjectURL(url); }
  if (!data) return <Shell><p>{error || "Loading audit trail…"}</p></Shell>;
  const entries = actor === "all" ? data.entries : data.entries.filter((e) => e.actor === actor);
  return <Shell><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-semibold">Audit trail</h1><p className="mt-1 text-muted-foreground">Reference {data.reference}</p></div>{data.status && <StatusBadge status={data.status}/>}</div>
    <p className="mt-3 text-sm text-muted-foreground">Every claim step is logged with its actor, inputs, outputs and rule. Internal settlement limits are restricted to authorized adjusters.</p>
    <Card className="mt-6"><div className="flex flex-wrap items-center justify-between gap-3"><label className="text-sm">Filter by actor <select className="ml-2 rounded-md border bg-background px-3 py-2" value={actor} onChange={(e) => setActor(e.target.value)}><option value="all">All actors</option>{["Customer", "AI model", "Policy engine", "Verifier", "Adjuster"].map((a) => <option key={a}>{a}</option>)}</select></label><Button variant="outline" onClick={download}><Download className="mr-2 size-4"/>Download JSON</Button></div>
      <ol className="mt-6 space-y-5 border-l pl-5">{entries.map((e, i) => <li key={e.id ?? i} className="relative"><span className="absolute -left-[25px] top-1 size-2.5 rounded-full bg-teal"/><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{e.step}</h2><span className="text-xs text-muted-foreground">{e.created_at ? new Date(e.created_at).toLocaleString() : "Time not recorded"}</span></div><p className="mt-1 text-xs font-medium text-teal">{e.actor}</p>{e.input_summary && <p className="mt-2 text-sm"><span className="text-muted-foreground">Input: </span>{e.input_summary}</p>}{e.output_summary && <p className="mt-1 text-sm"><span className="text-muted-foreground">Output: </span>{e.output_summary}</p>}{e.rule && <p className="mt-1 text-xs text-muted-foreground">Rule: {e.rule}</p>}{e.confidence != null && <p className="mt-1 text-xs text-muted-foreground">Confidence: {Math.round(e.confidence * 100)}%</p>}</li>)}</ol>
      {entries.length === 0 && <p className="mt-6 text-sm text-muted-foreground">No audit entries for this filter.</p>}
    </Card><Button asChild variant="outline" className="mt-5"><Link to="/">Back to home</Link></Button>
  </Shell>;
}
