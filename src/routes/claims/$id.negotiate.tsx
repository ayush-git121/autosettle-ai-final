import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, EngineBadge, money, Shell, Steps, StatusBadge } from "@/components/claim/ui";
import { api, type ClaimView } from "@/services/api";

export const Route = createFileRoute("/claims/$id/negotiate")({ component: Negotiate });
function Negotiate() {
  const { id } = Route.useParams(); const nav = useNavigate();
  const [claim, setClaim] = useState<ClaimView | null>(null); const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function refresh(open = false) { const c = open ? await api.getOffer(id) : await api.getClaim(id); setClaim(c); }
  useEffect(() => { refresh(true).catch((e) => setError((e as Error).message)); }, [id]);
  async function send(value = text) { if (!value.trim()) return; setBusy(true); setError(""); try { const c = await api.chat(id, value); setClaim(c); setText(""); if (c.status === "settled") nav({ to: "/claims/$id/audit", params: { id } }); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  if (!claim) return <Shell><p>{error || "Preparing your offer…"}</p></Shell>;
  const finished = ["settled", "escalated", "closed"].includes(claim.status);
  return <Shell>
    <Steps current={claim.status === "settled" ? 4 : 3}/><div className="flex items-start justify-between gap-3"><div><h1 className="text-3xl font-semibold">Cash settlement</h1><p className="mt-1 text-muted-foreground">Reference {claim.reference}</p></div><StatusBadge status={claim.status}/></div>
    <Card className="mt-6"><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-teal"/><h2 className="font-semibold">Policy-engine offer</h2></div><p className="mt-2 text-3xl font-semibold">{money(claim.settlementAmount ?? claim.currentOffer ?? 0)}</p><EngineBadge/><p className="mt-3 text-sm text-muted-foreground">You can accept this offer or counter with an amount. The policy engine—not the AI chat—sets every amount. Internal settlement limits are not shown here.</p><p className="mt-3 text-sm">Round {Math.min((claim.round ?? 0) + 1, 3)} of 3</p></Card>
    <Card className="mt-5"><h2 className="font-semibold">Negotiation chat</h2><div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto">{claim.messages.map((m) => <div key={m.id} className={`max-w-[88%] rounded-xl p-3 text-sm ${m.role === "customer" ? "ml-auto bg-navy text-navy-foreground" : "bg-muted"}`}><p>{m.content}</p>{m.role !== "customer" && <EngineBadge/>}<p className="mt-1 text-[10px] opacity-70">{new Date(m.created_at).toLocaleString()}</p></div>)}</div>
      {!finished && <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void send(); }}><Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Accept, or enter a counter amount (e.g. ₹8,000)…" aria-label="Your message or counter offer"/><div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || !text.trim()}><Send className="mr-2 size-4"/>{busy ? "Sending…" : "Send message"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void send("I accept the offer")}>Accept offer</Button></div></form>}
      {finished && <div className="mt-4 rounded-lg bg-muted p-3 text-sm">{claim.status === "settled" ? `Settlement confirmed: ${money(claim.settlementAmount ?? 0)}.` : "This claim has been sent for human review or is closed."}<div className="mt-3"><Button asChild variant="outline"><Link to="/claims/$id/audit" params={{ id }}>View audit trail</Link></Button></div></div>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </Card>
  </Shell>;
}
