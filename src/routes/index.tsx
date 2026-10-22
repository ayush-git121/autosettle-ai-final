import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, MessagesSquare, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Shell } from "@/components/claim/ui";
import hero from "@/assets/hero-car.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Auto-Settle AI — From a damage photo to a safe cash settlement" },
      { name: "description", content: "Upload photos of a dent or scratch, get a rule-based repair estimate and negotiate a cash settlement in minutes." },
      { property: "og:title", content: "Auto-Settle AI — Video-to-cash claims adjuster" },
      { property: "og:description", content: "AI perceives and talks. Code decides the money." },
    ],
  }),
  component: Index,
});

const STEPS = [
  { icon: ShieldCheck, title: "Verify your policy", body: "Policy number, vehicle number and registered mobile. No OTP." },
  { icon: Camera, title: "Upload real photos", body: "AI finds the damaged part. A rate card prices the repair." },
  { icon: MessagesSquare, title: "Settle in a chat", body: "Negotiate within limits set by the policy engine, never by the AI." },
];

function Index() {
  return (
    <Shell wide>
      <section className="grid items-center gap-10 md:grid-cols-2">
        <div>
          <p className="mb-3 text-sm font-medium uppercase tracking-wider text-teal">Minor motor claims · dents, scratches, mirrors</p>
          <h1 className="text-4xl font-semibold leading-tight md:text-5xl">From a damage photo to a safe cash settlement</h1>
          <p className="mt-4 max-w-md text-lg text-muted-foreground">AI perceives and talks. Code decides the money. Anything uncertain goes to a human adjuster.</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button asChild size="lg"><Link to="/verify">Start a claim</Link></Button>
            <Link to="/adjuster" className="text-sm text-muted-foreground underline-offset-4 hover:underline">Adjuster login</Link>
          </div>
        </div>
        <img src={hero} alt="Close-up of a car door with a light scratch" width={1280} height={960} className="aspect-[4/3] w-full rounded-2xl object-cover shadow-[var(--shadow-card)]" />
      </section>
      <ol className="mt-16 grid gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="card-surface p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-teal-soft text-teal"><s.icon className="size-4" aria-hidden /></span>
              <span className="text-sm text-muted-foreground">Step {i + 1}</span>
            </div>
            <h2 className="mt-4 text-xl font-semibold">{s.title}</h2>
            <p className="mt-1 text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>
    </Shell>
  );
}
