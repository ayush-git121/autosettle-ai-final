import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  ENGINE_CONFIG as C, decide, detectManipulation, formatINR, isAcceptance, mergeDamages, parseAmount,
  priceDamages, priorityFor, replyAmountsValid, settlementLimits, severityAgrees, type CostRow, type Damage, type Estimate,
} from "@/lib/engine";
import { assessConfidence, type ConfidenceResult } from "@/lib/engine/confidence";
import { crossCheck } from "@/lib/engine/crosscheck";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Actor = "Customer" | "AI model" | "Policy engine" | "Verifier" | "Adjuster";
async function audit(
  claimId: string | null,
  actor: Actor,
  step: string,
  e: { input?: string; output?: string; rule?: string; confidence?: number; internal?: boolean } = {},
) {
  const s = await db();
  await s.from("audit_entries").insert({
    claim_id: claimId, actor, step,
    input_summary: e.input?.slice(0, 500) ?? null, output_summary: e.output?.slice(0, 800) ?? null,
    rule: e.rule ?? null, confidence: e.confidence ?? null, internal: e.internal ?? false,
  });
}

async function escalate(claimId: string, reasons: string[]) {
  const s = await db();
  const { data: c } = await s.from("claims").select("escalation_reasons").eq("id", claimId).single();
  const all = [...new Set([...(((c?.escalation_reasons as string[]) ?? [])), ...reasons])];
  await s.from("claims").update({ status: "escalated", escalation_reasons: all, priority: priorityFor(all), updated_at: new Date().toISOString() }).eq("id", claimId);
  await audit(claimId, "Policy engine", "Escalated to human adjuster", { output: reasons.join("; "), rule: "Escalate instead of guessing" });
}

function checkAdjuster(pw: string) {
  const real = process.env["ADJUSTER_PASSWORD"];
  if (!real || pw !== real) throw new Error("Invalid adjuster password");
}

// ---------------- Policy verification ----------------
export const verifyPolicy = createServerFn({ method: "POST" })
  .validator(z.object({
    policyNumber: z.string().trim().min(1).max(40),
    registration: z.string().trim().min(1).max(20),
    mobile: z.string().trim().min(6).max(15),
    incidentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    attemptKey: z.string().min(8).max(64),
  }).parse)
  .handler(async ({ data }) => {
    const s = await db();
    const { data: att } = await s.from("verify_attempts").select("failures").eq("key", data.attemptKey).maybeSingle();
    if ((att?.failures ?? 0) >= C.maxVerifyFailures) return { result: "locked" as const };

    const fail = async (message: string) => {
      const failures = (att?.failures ?? 0) + 1;
      await s.from("verify_attempts").upsert({ key: data.attemptKey, failures, updated_at: new Date().toISOString() });
      await audit(null, "Verifier", "Policy check failed", { input: data.policyNumber.toUpperCase(), output: message });
      return failures >= C.maxVerifyFailures
        ? { result: "locked" as const }
        : { result: "failed" as const, message, attemptsLeft: C.maxVerifyFailures - failures };
    };

    const norm = (x: string) => x.toUpperCase().replace(/[\s-]/g, "");
    const policyNumber = data.policyNumber.trim().toUpperCase();
    const { data: p, error: policyQueryError } = await s
      .from("policies")
      .select("*")
      .eq("policy_number", policyNumber)
      .maybeSingle();

    if (policyQueryError) {
      console.error("[Policy verification] Supabase query failed:", policyQueryError);
      throw new Error(`Policy lookup failed: ${policyQueryError.message}`);
    }
    if (!p) {
      console.warn("[Policy verification] No matching policy:", policyNumber);
      return fail("Policy not found. Please check the policy number.");
    }
    if (norm(String(p.registration ?? "")) !== norm(data.registration)) {
      return fail("Registration mismatch: this vehicle number is not on the policy.");
    }
    if (String(p.mobile ?? "").replace(/\D/g, "").slice(-10) !== data.mobile.replace(/\D/g, "").slice(-10)) {
      return fail("Mobile number does not match the registered mobile.");
    }

    const failed: string[] = [];
    if (data.incidentDate < p.start_date || data.incidentDate > p.end_date) failed.push(`The policy was not active on ${data.incidentDate} (cover ${p.start_date} to ${p.end_date}).`);
    if (!p.own_damage) failed.push("The policy is third-party only and does not cover damage to your own car.");
    if (p.claims_this_year >= C.maxClaimsPerYear) failed.push(`There are already ${p.claims_this_year} claims this year (limit ${C.maxClaimsPerYear}).`);

    const status = failed.length ? "escalated" : "verified";
    const { data: claim, error } = await s.from("claims").insert({
      policy_number: p.policy_number, incident_date: data.incidentDate, status,
      escalation_reasons: failed.length ? ["Policy check failed", ...failed] : [],
      priority: "normal",
    }).select("id, reference").single();
    if (error) throw error;
    await audit(claim.id, "Verifier", "Policy check", {
      input: `${p.policy_number}, ${p.registration}, incident ${data.incidentDate}`,
      output: failed.length ? `Needs review: ${failed.join(" ")}` : "All 6 checks passed",
      rule: "exists → registration → mobile → active on date → own damage → claims < 2",
    });
    if (failed.length) await audit(claim.id, "Policy engine", "Escalated to human adjuster", { output: failed.join(" "), rule: "Policy check failed" });
    await s.from("verify_attempts").delete().eq("key", data.attemptKey);

    return {
      result: failed.length ? ("review" as const) : ("verified" as const),
      claimId: claim.id, failedChecks: failed,
      vehicle: { make: p.make, model: p.model, year: p.year, registration: p.registration },
      idv: p.idv, coverType: p.cover_type, zeroDep: p.zero_dep,
    };
  });

// ---------------- Media ----------------
function sniff(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}
function hamming(a: string, b: string) {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

export const uploadMedia = createServerFn({ method: "POST" })
  .validator(z.object({
    claimId: z.string().uuid(),
    base64: z.string().max(14_000_000),
    fileName: z.string().max(200),
    source: z.enum(["photo", "video-frame"]),
    phash: z.string().regex(/^[0-9a-f]{16}$/),
    quality: z.object({ width: z.number(), height: z.number(), blur: z.number(), brightness: z.number(), issues: z.array(z.string()) }),
    exif: z.object({ hasExif: z.boolean(), software: z.string().nullable(), dateTaken: z.string().nullable(), originalType: z.string() }),
  }).parse)
  .handler(async ({ data }) => {
    const s = await db();
    const { data: claim } = await s.from("claims").select("id, status, incident_date").eq("id", data.claimId).single();
    if (!claim) throw new Error("Claim not found");
    if (!["verified", "uploading", "more_photos_requested"].includes(claim.status)) throw new Error("Uploads are closed for this claim");
    const { count } = await s.from("media").select("id", { count: "exact", head: true }).eq("claim_id", data.claimId);
    if ((count ?? 0) >= 6) throw new Error("Maximum 6 images per claim");

    const bin = Uint8Array.from(atob(data.base64), (ch) => ch.charCodeAt(0));
    const type = sniff(bin);
    if (!type) throw new Error("File content is not a JPEG, PNG or WebP image");
    if (bin.length > 10 * 1024 * 1024) throw new Error("Image larger than 10 MB");

    const path = `${data.claimId}/${crypto.randomUUID()}.${type.split("/")[1]}`;
    const up = await s.storage.from("claim-media").upload(path, bin, { contentType: type });
    if (up.error) throw up.error;

    // Fraud signals (never auto-reject; they add escalation reasons)
    const signals: string[] = []; // hard: always reviewed by a human
    const soft: string[] = []; // soft: lowers AI confidence only
    const notes: string[] = [];
    const { data: others } = await s.from("media").select("phash, claim_id").neq("claim_id", data.claimId).not("phash", "is", null).limit(5000);
    const reused = (others ?? []).find((o) => o.phash && hamming(o.phash, data.phash) <= 6);
    if (reused) signals.push("Reused image (matches a photo from an earlier claim)");
    if (data.exif.software && /photoshop|gimp|lightroom|snapseed|picsart|canva|facetune|pixlr|editor/i.test(data.exif.software))
      signals.push(`Edited image (software: ${data.exif.software})`);
    if (data.source === "photo") {
      if (!data.exif.hasExif) notes.push("No camera metadata (common for messaging apps / screenshots)");
      if (data.exif.dateTaken) {
        const days = Math.abs(new Date(data.exif.dateTaken).getTime() - new Date(claim.incident_date).getTime()) / 864e5;
        const msg = `Capture date ${data.exif.dateTaken.slice(0, 10)} is ${Math.round(days)} days from the incident`;
        if (days > C.captureDateHardDays) signals.push(msg);
        else if (days > C.captureDateSoftDays) soft.push(msg);
      }
    }

    const { data: m, error } = await s.from("media").insert({
      claim_id: data.claimId, storage_path: path, kind: "image", source: data.source, phash: data.phash,
      quality: data.quality, exif: { ...data.exif, signals, soft, notes },
    }).select("id").single();
    if (error) throw error;
    await s.from("claims").update({ status: "uploading" }).eq("id", data.claimId);
    await audit(data.claimId, "Customer", "File uploaded", { input: `${data.fileName} (${data.source}, ${type})`, output: `${data.quality.width}×${data.quality.height}` });
    await audit(data.claimId, "Verifier", "Quality check", {
      input: data.fileName,
      output: data.quality.issues.length ? data.quality.issues.join("; ") : `OK (sharpness ${data.quality.blur.toFixed(0)}, brightness ${data.quality.brightness.toFixed(0)})`,
      rule: "Laplacian variance, mean luminance, short side ≥ 640 px",
    });
    if (signals.length || soft.length || notes.length)
      await audit(data.claimId, "Verifier", "Fraud signals", { input: data.fileName, output: [...signals, ...soft, ...notes].join("; "), rule: "Perceptual hash + EXIF (reused/edited = review; other signals only lower confidence)" });
    return { mediaId: m.id, signals };
  });

export const deleteMedia = createServerFn({ method: "POST" })
  .validator(z.object({ claimId: z.string().uuid(), mediaId: z.string().uuid() }).parse)
  .handler(async ({ data }) => {
    const s = await db();
    const { data: c } = await s.from("claims").select("status").eq("id", data.claimId).single();
    if (!c || !["verified", "uploading", "more_photos_requested"].includes(c.status)) throw new Error("Cannot change photos now");
    const { data: m } = await s.from("media").select("storage_path").eq("id", data.mediaId).eq("claim_id", data.claimId).single();
    if (m) {
      await s.storage.from("claim-media").remove([m.storage_path]);
      await s.from("media").delete().eq("id", data.mediaId);
      await audit(data.claimId, "Customer", "File removed", { input: m.storage_path.split("/")[1] });
    }
    return { ok: true };
  });

// ---------------- Assessment ----------------
const KNOWN_MAKES = ["maruti", "suzuki", "hyundai", "tata", "honda", "kia", "toyota", "mahindra", "bmw", "mercedes", "audi", "ford", "volkswagen", "vw", "skoda", "renault", "nissan", "mg", "jeep", "volvo", "porsche", "tesla", "chevrolet", "fiat", "lexus", "jaguar", "land rover", "mitsubishi", "peugeot", "citroen", "mazda", "subaru"];
function vehicleConflicts(hint: string | null | undefined, make: string) {
  if (!hint) return false;
  const h = hint.toLowerCase();
  const own = make.toLowerCase();
  const aliases = own === "maruti" || own === "suzuki" ? ["maruti", "suzuki"] : [own];
  const mentioned = KNOWN_MAKES.filter((m) => new RegExp(`\\b${m}\\b`).test(h));
  return mentioned.length > 0 && !mentioned.some((m) => aliases.includes(m));
}

export const assessClaim = createServerFn({ method: "POST" })
  .validator(z.object({ claimId: z.string().uuid() }).parse)
  .handler(async ({ data }) => {
    const { detectDamage, ModelUnavailable } = await import("@/server/ai.server");
    const s = await db();
    const { data: claim } = await s.from("claims").select("*").eq("id", data.claimId).single();
    if (!claim) throw new Error("Claim not found");
    if (claim.status !== "uploading") throw new Error("This claim is not ready for assessment");
    const { data: media } = await s.from("media").select("*").eq("claim_id", data.claimId).order("created_at");
    if (!media?.length) throw new Error("Please upload at least one photo");
    if (claim.model_calls + media.length > C.maxModelCallsPerClaim) throw new Error("Analysis limit reached for this claim");
    const { data: policy } = await s.from("policies").select("*").eq("policy_number", claim.policy_number!).single();
    await s.from("claims").update({ status: "assessing", model_calls: claim.model_calls + media.length }).eq("id", data.claimId);

    const hardReasons: string[] = [];
    const softSignals: string[] = [];
    for (const m of media) {
      const ex = m.exif as { signals?: string[]; soft?: string[] } | null;
      for (const sig of ex?.signals ?? []) hardReasons.push(sig.split(" (")[0].replace(/^(Capture date).*/, "Capture date far from incident"));
      for (const sig of ex?.soft ?? []) softSignals.push("Photo capture date far from incident");
    }

    // Vision model (+ optional YOLO second opinion) on each real image
    const { detectWithYolo, yoloEnabled } = await import("@/server/yolo.server");
    const yoloOn = yoloEnabled();
    const perMedia = await Promise.all(media.map(async (m) => {
      try {
        const dl = await s.storage.from("claim-media").download(m.storage_path);
        if (dl.error) throw dl.error;
        const buf = new Uint8Array(await dl.data.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        const b64 = btoa(bin);
        const det = await detectDamage({ mediaType: dl.data.type || "image/jpeg", base64: b64 });
        await audit(data.claimId, "AI model", "Damage detection", {
          input: `Photo ${m.id.slice(0, 8)}`,
          output: det.isCarPresent
            ? det.damages.length ? det.damages.map((d) => `${d.part} ${d.damageType} ${d.severity} (${Math.round(d.damageRatio)}%, conf ${Math.round(d.confidence * 100)}%)`).join(", ") : `Car present, no damage found${det.unclearReason ? `: ${det.unclearReason}` : ""}`
            : "No car detected in this photo",
          confidence: det.damages.length ? Math.min(...det.damages.map((d) => d.confidence)) : det.photoConfidence,
          rule: det.vehicleHint ? `Vehicle hint: ${det.vehicleHint}` : undefined,
        });

        // Optional second detector: agreement raises confidence, silence lowers it. Failure is never fatal.
        let yolo = { agreed: 0, unconfirmed: 0, extra: 0, ran: false };
        if (yoloOn && det.isCarPresent) {
          try {
            const boxes = await detectWithYolo(b64);
            const cc = crossCheck(det.damages as Damage[], boxes);
            det.damages = cc.damages as typeof det.damages;
            yolo = { agreed: cc.agreed, unconfirmed: cc.unconfirmed, extra: cc.extra, ran: true };
            await audit(data.claimId, "AI model", "YOLO cross-check", {
              input: `Photo ${m.id.slice(0, 8)}: ${boxes.length} YOLO boxes`,
              output: `${cc.agreed} of ${det.damages.length} VLM damages confirmed, ${cc.extra} extra YOLO detections`,
              rule: "Box overlap (IoU) or centre-inside match; agreement raises confidence",
            });
          } catch (e) {
            await audit(data.claimId, "AI model", "YOLO unavailable", { output: String((e as Error).message).slice(0, 150), rule: "Second detector skipped; not a reason to escalate" });
          }
        }
        await s.from("media").update({ detection: det }).eq("id", m.id);
        return { m, det, yolo, failed: false };
      } catch (e) {
        console.error("[Damage detection failed]", e);
        await audit(data.claimId, "AI model", "Damage detection failed", { input: `Photo ${m.id.slice(0, 8)}`, output: (e instanceof ModelUnavailable ? e.message : `Unexpected error: ${String((e as Error)?.message ?? e)}`).slice(0, 300) });
        return { m, det: null, yolo: { agreed: 0, unconfirmed: 0, extra: 0, ran: false }, failed: true };
      }
    }));

    // Only escalate for model trouble when NO photo could be analysed; partial failures just lower confidence.
    const usable = perMedia.filter((p) => p.det);
    if (!usable.length) {
      await s.from("claims").update({ assessment: { modelUnavailable: true } }).eq("id", data.claimId);
      await escalate(data.claimId, ["AI model unavailable"]);
      return { status: "escalated" };
    }

    const carPhotos = usable.filter((p) => p.det!.isCarPresent);
    if (!carPhotos.length) {
      await s.from("claims").update({ assessment: { noCar: true, damages: [] }, estimate: null }).eq("id", data.claimId);
      await escalate(data.claimId, ["Car not detected"]);
      return { status: "escalated" };
    }

    const all: Damage[] = carPhotos.flatMap((p) => p.det!.damages.map((d) => ({ ...d, mediaId: p.m.id })));
    const merged = mergeDamages(all);
    const checks = merged.map((d) => ({ part: d.part, agrees: severityAgrees(d) }));
    await audit(data.claimId, "Policy engine", "Merge & severity cross-check", {
      input: `${all.length} detections`, output: `${merged.length} unique parts; ${checks.map((c) => `${c.part}: ${c.agrees ? "agree" : "disagree"}`).join(", ") || "none"}`,
      rule: "Same part priced once (highest confidence). Ratio <10% minor, 10–30% moderate, >30% severe. A one-band difference only lowers confidence.",
    });

    if (!merged.length) hardReasons.push("No visible damage detected");
    const mismatch = carPhotos.some((p) => vehicleConflicts(p.det!.vehicleHint, policy!.make));

    let estimate: Estimate | null = null;
    if (merged.length) {
      const { data: seg } = await s.from("vehicle_segments").select("segment").eq("make", policy!.make).eq("model", policy!.model).maybeSingle();
      const segment = seg?.segment ?? "sedan";
      const { data: rows } = await s.from("repair_costs").select("*").eq("segment", segment);
      const age = new Date(claim.incident_date).getFullYear() - policy!.year;
      estimate = priceDamages(merged, rows as CostRow[], { segment, vehicleAgeYears: age, zeroDep: policy!.zero_dep });
      for (const l of estimate.lines)
        await audit(data.claimId, "Policy engine", "Pricing", {
          input: `${l.part} ${l.damageType} ${l.severity}`,
          output: `${l.action}: parts ${formatINR(l.parts)} + labour ${formatINR(l.labour)} + paint ${formatINR(l.paint)} − dep ${formatINR(l.depreciation)} = ${formatINR(l.total)}`,
          rule: `${l.rule}; ${segment} rate card; depreciation ${(l.depreciationPct * 100).toFixed(0)}%${policy!.zero_dep ? " (zero-dep)" : ""}`,
        });
    }
    const limits = estimate ? settlementLimits(estimate.total) : null;
    if (limits) await audit(data.claimId, "Policy engine", "Settlement range set", { output: `floor ${formatINR(limits.floor)}, ceiling ${formatINR(limits.ceiling)}`, rule: "70%–90% of estimate, rounded to ₹100", internal: true });

    // Confidence-based routing: a human only sees claims the AI is NOT confident about.
    const conf: ConfidenceResult = assessConfidence({
      damages: merged,
      photoConfidences: carPhotos.map((p) => p.det!.photoConfidence),
      qualityIssuePhotos: media.filter((m) => ((m.quality as { issues?: string[] } | null)?.issues ?? []).length > 0).length,
      failedPhotos: perMedia.filter((p) => p.failed).length,
      nonCarPhotos: usable.length - carPhotos.length,
      softSignals: [...new Set(softSignals)],
      vehicleMismatch: mismatch,
      estimateTotal: estimate?.total ?? null,
      yolo: { enabled: carPhotos.some((p) => p.yolo.ran), agreed: carPhotos.reduce((a, p) => a + p.yolo.agreed, 0), unconfirmed: carPhotos.reduce((a, p) => a + p.yolo.unconfirmed, 0), extra: carPhotos.reduce((a, p) => a + p.yolo.extra, 0) },
      hardReasons,
    });
    await audit(data.claimId, "Policy engine", "Confidence evaluation", {
      input: `${merged.length} damage(s), ${carPhotos.length} car photo(s)`,
      output: `Overall AI confidence ${Math.round(conf.score * 100)}% (${conf.level}) → ${conf.autoProceed ? "proceed to cash offer" : "human adjuster review"}`,
      confidence: conf.score,
      rule: conf.factors.map((f) => `${f.label}: ${f.delta >= 0 ? "+" : ""}${Math.round(f.delta * 100)}`).join(" | ").slice(0, 780),
    });

    await s.from("claims").update({
      assessment: { damages: merged, checks, vehicleHint: carPhotos[0].det!.vehicleHint ?? null, confidence: conf } as unknown as import("@/integrations/supabase/types").Json,
      estimate: estimate as unknown as import("@/integrations/supabase/types").Json, limits, status: "assessed", updated_at: new Date().toISOString(),
    }).eq("id", data.claimId);

    if (!conf.autoProceed) {
      await escalate(data.claimId, [...new Set([...conf.hardReasons, ...conf.reviewReasons])]);
      return { status: "escalated" };
    }
    return { status: "assessed" };
  });

// ---------------- Read claim (customer view; no limits) ----------------
async function signed(paths: string[]) {
  const s = await db();
  if (!paths.length) return {} as Record<string, string>;
  const { data } = await s.storage.from("claim-media").createSignedUrls(paths, 3600);
  return Object.fromEntries((data ?? []).map((d) => [d.path, d.signedUrl]));
}

async function loadClaim(claimId: string, includeLimits: boolean) {
  const s = await db();
  const { data: c } = await s.from("claims").select("*").eq("id", claimId).single();
  if (!c) throw new Error("Claim not found");
  const [{ data: media }, { data: messages }, { data: policy }] = await Promise.all([
    s.from("media").select("id, storage_path, source, quality, exif, detection, created_at").eq("claim_id", claimId).order("created_at"),
    s.from("messages").select("id, role, content, amount, action, created_at").eq("claim_id", claimId).order("created_at"),
    s.from("policies").select("policy_number, make, model, year, registration, cover_type, idv, zero_dep").eq("policy_number", c.policy_number ?? "").maybeSingle(),
  ]);
  const urls = await signed((media ?? []).map((m) => m.storage_path));
  return {
    id: c.id, reference: c.reference, status: c.status, incidentDate: c.incident_date, createdAt: c.created_at,
    escalationReasons: c.escalation_reasons as string[], assessment: c.assessment as null | { damages?: Damage[]; checks?: { part: string; agrees: boolean }[]; noCar?: boolean; modelUnavailable?: boolean; vehicleHint?: string | null; confidence?: ConfidenceResult },
    estimate: c.estimate as Estimate | null, currentOffer: c.current_offer, round: c.round, settlementAmount: c.settlement_amount,
    priority: c.priority, limits: includeLimits ? (c.limits as { floor: number; ceiling: number } | null) : null,
    policy,
    media: (media ?? []).map((m) => ({ id: m.id, url: urls[m.storage_path] ?? "", source: m.source, quality: m.quality, exif: m.exif, detection: m.detection })),
    messages: messages ?? [],
  };
}
export type ClaimView = Awaited<ReturnType<typeof loadClaim>>;

export const getClaim = createServerFn({ method: "POST" })
  .validator(z.object({ claimId: z.string().uuid() }).parse)
  .handler(async ({ data }) => loadClaim(data.claimId, false));

export const sendToAdjuster = createServerFn({ method: "POST" })
  .validator(z.object({ claimId: z.string().uuid() }).parse)
  .handler(async ({ data }) => {
    await audit(data.claimId, "Customer", "Requested human adjuster");
    await escalate(data.claimId, ["Customer requested adjuster"]);
    return { ok: true };
  });

// ---------------- Negotiation ----------------
async function reply(claimId: string, action: string, amount: number, customerText: string, template: string, note?: string) {
  const s = await db();
  const { writeReply } = await import("@/server/ai.server");
  let text = template;
  let source = "template";
  const { data: c } = await s.from("claims").select("model_calls").eq("id", claimId).single();
  if ((c?.model_calls ?? 0) < C.maxModelCallsPerClaim + 10) {
    try {
      await s.from("claims").update({ model_calls: (c?.model_calls ?? 0) + 1 }).eq("id", claimId);
      const t = (await writeReply({ action, amount, amountText: formatINR(amount), customerText, note })).trim();
      if (t && replyAmountsValid(t, amount)) { text = t; source = "AI model"; }
      else await audit(claimId, "Policy engine", "Model reply discarded", { output: t.slice(0, 200), rule: "Every rupee figure must equal the engine amount" });
    } catch {
      await audit(claimId, "AI model", "Reply unavailable, safe template used");
    }
  }
  await s.from("messages").insert({ claim_id: claimId, role: "assistant", content: text, amount, action });
  await audit(claimId, source === "AI model" ? "AI model" : "Policy engine", "Assistant reply", { input: `${action} ${formatINR(amount)}`, output: text });
}

export const getOffer = createServerFn({ method: "POST" })
  .validator(z.object({ claimId: z.string().uuid() }).parse)
  .handler(async ({ data }) => {
    const s = await db();
    const { data: c } = await s.from("claims").select("*").eq("id", data.claimId).single();
    if (!c) throw new Error("Claim not found");
    if (c.status === "assessed") {
      const limits = c.limits as { floor: number };
      // Claim the row atomically so a double page load creates only one offer.
      const { data: claimed } = await s.from("claims")
        .update({ status: "negotiating", current_offer: limits.floor, round: 0 })
        .eq("id", data.claimId).eq("status", "assessed").select("id").maybeSingle();
      if (claimed) {
        await audit(data.claimId, "Policy engine", "Opening offer", { output: formatINR(limits.floor), rule: "Opening offer = floor" });
        await reply(data.claimId, "opening offer", limits.floor, "",
          `Based on your photos, we can offer ${formatINR(limits.floor)} as a cash settlement. You can accept or tell me the amount you had in mind.`);
      }
    }
    return loadClaim(data.claimId, false);
  });

export const sendChat = createServerFn({ method: "POST" })
  .validator(z.object({ claimId: z.string().uuid(), text: z.string().trim().min(1).max(500) }).parse)
  .handler(async ({ data }) => {
    const s = await db();
    const { data: c } = await s.from("claims").select("*").eq("id", data.claimId).single();
    if (!c) throw new Error("Claim not found");
    if (c.status !== "negotiating") throw new Error("This negotiation is closed");
    const lastMin = new Date(Date.now() - 60_000).toISOString();
    const { count } = await s.from("messages").select("id", { count: "exact", head: true }).eq("claim_id", data.claimId).eq("role", "customer").gte("created_at", lastMin);
    if ((count ?? 0) >= 8) throw new Error("Too many messages, please wait a minute");

    await s.from("messages").insert({ claim_id: data.claimId, role: "customer", content: data.text });
    await audit(data.claimId, "Customer", "Customer message", { input: data.text });
    const limits = c.limits as { floor: number; ceiling: number };
    const estimate = (c.estimate as unknown as Estimate).total;
    const current = c.current_offer!;

    // Guard runs BEFORE the model
    const g = detectManipulation(data.text);
    if (g.flagged) {
      const attempts = c.manipulation_attempts + 1;
      await s.from("claims").update({ manipulation_attempts: attempts }).eq("id", data.claimId);
      await audit(data.claimId, "Policy engine", "Manipulation attempt", { input: data.text, output: `Offer unchanged at ${formatINR(current)}`, rule: g.reason });
      if (attempts >= 2) {
        await s.from("messages").insert({ claim_id: data.claimId, role: "assistant", action: "escalate", amount: current,
          content: `I'm passing your claim to a human adjuster, who will review it and contact you. Your current offer of ${formatINR(current)} stays on record.` });
        await escalate(data.claimId, ["Manipulation attempt"]);
      } else {
        await s.from("messages").insert({ claim_id: data.claimId, role: "assistant", action: "hold", amount: current,
          content: `I can only work with the amount set by our policy engine. The current offer is ${formatINR(current)}. Tell me the amount you had in mind, or accept.` });
      }
      return loadClaim(data.claimId, false);
    }

    const counter = isAcceptance(data.text) ? null : parseAmount(data.text);
    if (counter === null && !isAcceptance(data.text)) {
      await reply(data.claimId, "restate current offer", current, data.text,
        `The current offer is ${formatINR(current)}. You can accept it or tell me the amount you had in mind.`, "Customer did not state an amount");
      return loadClaim(data.claimId, false);
    }

    const d = decide({ currentOffer: current, round: c.round, floor: limits.floor, ceiling: limits.ceiling, estimate }, counter);
    await audit(data.claimId, "Policy engine", `Decision: ${d.action}`, { input: counter === null ? "accept" : formatINR(counter), output: formatINR(d.amount), rule: d.rule });

    if (d.action === "accept") {
      await s.from("claims").update({ status: "settled", settlement_amount: d.amount, current_offer: d.amount, round: d.round }).eq("id", data.claimId);
      await reply(data.claimId, "accept", d.amount, data.text, `Done! Your claim is settled at ${formatINR(d.amount)}. You'll receive the payment details shortly.`);
      await audit(data.claimId, "Policy engine", "Settled", { output: formatINR(d.amount) });
    } else if (d.action === "escalate") {
      await s.from("claims").update({ round: d.round }).eq("id", data.claimId);
      await reply(data.claimId, "escalate to human adjuster", d.amount, data.text,
        `I'll pass this to a human adjuster who can look at it in detail. Your current offer of ${formatINR(d.amount)} stays on record.`);
      await escalate(data.claimId, [d.rule.includes("far above") ? "Customer counter far above the estimate" : "3 rounds reached"]);
    } else {
      await s.from("claims").update({ current_offer: d.amount, round: d.round }).eq("id", data.claimId);
      await reply(data.claimId, d.action === "hold" ? "hold (counter too high)" : "improved offer", d.amount, data.text,
        d.action === "hold"
          ? `That's more than I can approve for this damage. The best I can do is ${formatINR(d.amount)}.`
          : `I can improve the offer to ${formatINR(d.amount)}.`);
    }
    return loadClaim(data.claimId, false);
  });

// ---------------- Audit ----------------
export const getAudit = createServerFn({ method: "POST" })
  .validator(z.object({ claimId: z.string().uuid(), adjusterPassword: z.string().optional() }).parse)
  .handler(async ({ data }) => {
    let internal = false;
    if (data.adjusterPassword) { checkAdjuster(data.adjusterPassword); internal = true; }
    const s = await db();
    let q = s.from("audit_entries").select("*").eq("claim_id", data.claimId).order("id");
    if (!internal) q = q.eq("internal", false);
    const { data: entries } = await q;
    const { data: c } = await s.from("claims").select("reference, status, limits").eq("id", data.claimId).single();
    return { reference: c?.reference, status: c?.status, limits: internal ? c?.limits : null, entries: entries ?? [] };
  });

// ---------------- Adjuster ----------------
export const adjusterLogin = createServerFn({ method: "POST" })
  .validator(z.object({ password: z.string().max(200) }).parse)
  .handler(async ({ data }) => { checkAdjuster(data.password); return { ok: true }; });

export const listEscalations = createServerFn({ method: "POST" })
  .validator(z.object({ password: z.string() }).parse)
  .handler(async ({ data }) => {
    checkAdjuster(data.password);
    const s = await db();
    const { data: rows } = await s.from("claims").select("id, reference, policy_number, status, escalation_reasons, estimate, priority, created_at")
      .in("status", ["escalated", "more_photos_requested"]).order("created_at", { ascending: false }).limit(200);
    const { data: pols } = await s.from("policies").select("policy_number, make, model, year, registration");
    const pm = new Map((pols ?? []).map((p) => [p.policy_number, p]));
    return (rows ?? []).map((r) => ({
      id: r.id, reference: r.reference, status: r.status, reasons: r.escalation_reasons as string[], priority: r.priority, createdAt: r.created_at,
      estimate: (r.estimate as Estimate | null)?.total ?? null, vehicle: pm.get(r.policy_number ?? "") ?? null, policyNumber: r.policy_number,
    }));
  });

export const getAdjusterClaim = createServerFn({ method: "POST" })
  .validator(z.object({ password: z.string(), claimId: z.string().uuid() }).parse)
  .handler(async ({ data }) => { checkAdjuster(data.password); return loadClaim(data.claimId, true); });

export const adjusterAction = createServerFn({ method: "POST" })
  .validator(z.object({
    password: z.string(), claimId: z.string().uuid(),
    action: z.enum(["approve", "set_amount", "request_photos", "close"]),
    amount: z.number().int().positive().max(10_000_000).optional(), note: z.string().max(500).optional(),
  }).parse)
  .handler(async ({ data }) => {
    checkAdjuster(data.password);
    const s = await db();
    const { data: c } = await s.from("claims").select("*").eq("id", data.claimId).single();
    if (!c) throw new Error("Claim not found");
    const offer = c.current_offer ?? (c.limits as { floor: number } | null)?.floor ?? null;
    let update: Record<string, unknown> = {};
    let out = "";
    if (data.action === "approve") {
      if (!offer) throw new Error("No offer to approve; set an amount instead");
      update = { status: "settled", settlement_amount: offer }; out = `Approved at ${formatINR(offer)}`;
    } else if (data.action === "set_amount") {
      if (!data.amount) throw new Error("Amount required");
      update = { status: "settled", settlement_amount: data.amount, current_offer: data.amount }; out = `Settled at ${formatINR(data.amount)}`;
    } else if (data.action === "request_photos") {
      update = { status: "more_photos_requested" }; out = "More photos requested from customer";
    } else {
      update = { status: "closed" }; out = "Claim closed";
    }
    await s.from("claims").update({ ...update, updated_at: new Date().toISOString() }).eq("id", data.claimId);
    await audit(data.claimId, "Adjuster", `Adjuster action: ${data.action.replace("_", " ")}`, { input: data.note, output: out });
    return { ok: true };
  });

// ---------------- Evaluation ----------------
export const getEvaluation = createServerFn({ method: "POST" }).handler(async () => {
  const s = await db();
  const { data: rows } = await s.from("claims").select("status, escalation_reasons, estimate, settlement_amount").limit(5000);
  const list = rows ?? [];
  const by = (st: string) => list.filter((r) => r.status === st).length;
  const reasonCounts: Record<string, number> = {};
  for (const r of list) for (const x of (r.escalation_reasons as string[]) ?? []) reasonCounts[x] = (reasonCounts[x] ?? 0) + 1;
  const settled = list.filter((r) => r.settlement_amount && r.estimate);
  const ratio = settled.length ? settled.reduce((a, r) => a + r.settlement_amount! / (r.estimate as unknown as Estimate).total, 0) / settled.length : null;
  return {
    total: list.length, settled: by("settled"), escalated: by("escalated"), closed: by("closed"), negotiating: by("negotiating"),
    avgSettlementToEstimate: ratio, reasons: Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]),
  };
});