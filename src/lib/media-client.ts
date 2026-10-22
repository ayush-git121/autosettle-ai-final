// Browser-only media processing: real content sniffing, pixel quality checks,
// perceptual hash (dHash), EXIF, video frame extraction, downscale for upload.
import exifr from "exifr";

export interface PreparedImage {
  id: string;
  name: string;
  source: "photo" | "video-frame";
  previewUrl: string;
  base64: string;
  phash: string;
  quality: { width: number; height: number; blur: number; brightness: number; issues: string[] };
  exif: { hasExif: boolean; software: string | null; dateTaken: string | null; originalType: string };
}

const MAX_IMG = 10 * 1024 * 1024;
const MAX_VID = 50 * 1024 * 1024;

export async function sniffFile(file: File): Promise<"image/jpeg" | "image/png" | "image/webp" | "video/mp4" | "video/quicktime" | null> {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const s = (a: number, z: number) => String.fromCharCode(...b.slice(a, z));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && s(1, 4) === "PNG") return "image/png";
  if (s(0, 4) === "RIFF" && s(8, 12) === "WEBP") return "image/webp";
  if (s(4, 8) === "ftyp") return s(8, 10) === "qt" ? "video/quicktime" : "video/mp4";
  return null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Could not decode image"));
    img.src = src;
  });
}

function canvasFrom(src: CanvasImageSource, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, w, h);
  return { c, ctx };
}

function gray(data: Uint8ClampedArray) {
  const g = new Float32Array(data.length / 4);
  for (let i = 0; i < g.length; i++) g[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  return g;
}

function analyse(src: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, 512 / Math.max(width, height));
  const w = Math.round(width * scale), h = Math.round(height * scale);
  const { ctx } = canvasFrom(src, w, h);
  const g = gray(ctx.getImageData(0, 0, w, h).data);
  let sum = 0;
  for (const v of g) sum += v;
  const brightness = sum / g.length;
  // Variance of Laplacian
  let n = 0, m = 0, m2 = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const lap = g[i - w] + g[i + w] + g[i - 1] + g[i + 1] - 4 * g[i];
    n++; const d = lap - m; m += d / n; m2 += d * (lap - m);
  }
  const blur = n ? m2 / n : 0;
  // dHash 9x8
  const { ctx: hc } = canvasFrom(src, 9, 8);
  const hg = gray(hc.getImageData(0, 0, 9, 8).data);
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += hg[y * 9 + x] > hg[y * 9 + x + 1] ? "1" : "0";
  let phash = "";
  for (let i = 0; i < 64; i += 4) phash += parseInt(bits.slice(i, i + 4), 2).toString(16);
  const issues: string[] = [];
  if (Math.min(width, height) < 640) issues.push("Resolution too low (short side under 640 px), please retake");
  if (blur < 40) issues.push("Too blurry, please retake");
  if (brightness < 50) issues.push("Too dark, please retake in better light");
  return { quality: { width, height, blur, brightness, issues }, phash };
}

function toUploadJpeg(src: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, 1600 / Math.max(width, height));
  const { c } = canvasFrom(src, Math.round(width * scale), Math.round(height * scale));
  const url = c.toDataURL("image/jpeg", 0.88);
  return { previewUrl: url, base64: url.split(",")[1] };
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const type = await sniffFile(file);
  if (!type || !type.startsWith("image/")) throw new Error(`${file.name}: not a real JPEG, PNG or WebP image`);
  if (file.size > MAX_IMG) throw new Error(`${file.name}: larger than 10 MB`);
  const objUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objUrl);
    const { quality, phash } = analyse(img, img.naturalWidth, img.naturalHeight);
    let exif: PreparedImage["exif"] = { hasExif: false, software: null, dateTaken: null, originalType: type };
    try {
      const e = await exifr.parse(file, ["Make", "Model", "Software", "DateTimeOriginal", "CreateDate"]);
      if (e) {
        const dt = e.DateTimeOriginal ?? e.CreateDate;
        exif = { hasExif: !!(e.Make || e.Model || dt), software: e.Software ?? null, dateTaken: dt instanceof Date ? dt.toISOString() : null, originalType: type };
      }
    } catch { /* no exif */ }
    return { id: crypto.randomUUID(), name: file.name, source: "photo", ...toUploadJpeg(img, img.naturalWidth, img.naturalHeight), phash, quality, exif };
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

export async function prepareVideo(file: File, frames = 5): Promise<PreparedImage[]> {
  const type = await sniffFile(file);
  if (type !== "video/mp4" && type !== "video/quicktime") throw new Error(`${file.name}: not a real MP4 or MOV video`);
  if (file.size > MAX_VID) throw new Error(`${file.name}: larger than 50 MB`);
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
  await new Promise<void>((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error("This video format can't be read in your browser")); });
  if (!isFinite(v.duration) || v.duration > 30.5) { URL.revokeObjectURL(url); throw new Error(`${file.name}: video must be 30 seconds or shorter`); }
  const out: PreparedImage[] = [];
  for (let i = 0; i < frames; i++) {
    const t = (v.duration * (i + 0.5)) / frames;
    await new Promise<void>((res) => { v.onseeked = () => res(); v.currentTime = t; });
    const { quality, phash } = analyse(v, v.videoWidth, v.videoHeight);
    out.push({
      id: crypto.randomUUID(), name: `${file.name} @ ${t.toFixed(1)}s`, source: "video-frame",
      ...toUploadJpeg(v, v.videoWidth, v.videoHeight), phash, quality,
      exif: { hasExif: false, software: null, dateTaken: null, originalType: type },
    });
  }
  URL.revokeObjectURL(url);
  return out;
}
