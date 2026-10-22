import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Shell, Steps } from "@/components/claim/ui";
import { api } from "@/services/api";
import { prepareImage, prepareVideo, type PreparedImage } from "@/lib/media-client";

export const Route = createFileRoute("/claims/$id/upload")({ component: UploadClaim });

function UploadClaim() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const [items, setItems] = useState<PreparedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function selectFiles(list: FileList | null) {
    if (!list?.length) return;
    setMessage("");
    try {
      const files = Array.from(list);
      if (files.some((f) => f.type.startsWith("video/")) && files.length !== 1) throw new Error("Upload one video at a time, or choose up to six photos.");
      if (files.some((f) => f.type.startsWith("video/"))) {
        const frames = await prepareVideo(files[0], 5);
        setItems((old) => [...old, ...frames].slice(0, 6));
      } else {
        if (items.length + files.length > 6) throw new Error("You can upload up to 6 photos.");
        const prepared = await Promise.all(files.map(prepareImage));
        setItems((old) => [...old, ...prepared].slice(0, 6));
      }
    } catch (e) { setMessage((e as Error).message || "Could not read the selected file."); }
  }

  async function submit() {
    if (!items.length) { setMessage("Add at least one real car damage photo or video first."); return; }
    setBusy(true); setMessage("Uploading photos and checking damage…");
    try {
      for (const item of items) await api.uploadMedia(id, item);
      await api.assess(id);
      await nav({ to: "/claims/$id/result", params: { id } });
    } catch (e) { setMessage((e as Error).message || "Upload or assessment failed. Please try again."); }
    finally { setBusy(false); }
  }

  return <Shell>
    <Steps current={1} />
    <h1 className="text-3xl font-semibold">Upload damage photos</h1>
    <p className="mt-2 text-muted-foreground">Use clear, well-lit photos showing the damaged area. Real file content is checked; filenames do not affect the assessment.</p>
    <Card className="mt-6">
      <label className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-border p-8 text-center hover:border-teal">
        <UploadCloud className="mb-3 size-8 text-teal" aria-hidden />
        <span className="font-medium">Choose photos or one short video</span>
        <span className="mt-1 text-sm text-muted-foreground">JPEG, PNG, WebP up to 10 MB each · MP4/MOV up to 30 seconds and 50 MB</span>
        <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" multiple onChange={(e) => { void selectFiles(e.currentTarget.files); e.currentTarget.value = ""; }} />
      </label>
      {items.length > 0 && <div className="mt-5 grid gap-3 sm:grid-cols-2">{items.map((item) => <div key={item.id} className="overflow-hidden rounded-lg border bg-background">
        <img src={item.previewUrl} alt={item.name} className="aspect-video w-full object-contain bg-muted" />
        <div className="flex items-start justify-between gap-2 p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.quality.width} × {item.quality.height}</p>{item.quality.issues.map((issue) => <p key={issue} className="mt-1 text-xs text-amber-foreground">{issue}</p>)}</div><Button size="icon" variant="ghost" aria-label={`Remove ${item.name}`} onClick={() => setItems((old) => old.filter((x) => x.id !== item.id))}><Trash2 className="size-4" /></Button></div>
      </div>)}</div>}
      {message && <p role="status" className="mt-4 rounded-lg bg-muted p-3 text-sm">{message}</p>}
      <div className="mt-6 flex flex-wrap gap-3"><Button onClick={() => void submit()} disabled={busy || !items.length}>{busy ? "Assessing…" : "Analyse damage"}</Button><Button asChild variant="outline"><Link to="/verify">Back</Link></Button></div>
      <p className="mt-4 text-xs text-muted-foreground">Quality flags are advisory. Low confidence, unclear damage, reused images, or suspicious metadata are sent for human review—not automatically rejected.</p>
    </Card>
  </Shell>;
}
