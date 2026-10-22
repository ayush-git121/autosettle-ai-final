// The ONE place the frontend talks to the backend.
// Every function calls a real server endpoint.

import * as fn from "@/claims.functions";
import type { ClaimView } from "@/claims.functions";
import type { PreparedImage } from "@/lib/media-client";

export type { ClaimView };

const ADJ_KEY = "autosettle.adjuster";
const ATTEMPT_KEY = "autosettle.attempt";

export const adjusterSession = {
  get: (): string | null => {
    if (typeof window === "undefined") return null;

    try {
      return window.sessionStorage.getItem(ADJ_KEY);
    } catch {
      return null;
    }
  },

  set: (password: string): void => {
    if (typeof window === "undefined") return;

    try {
      window.sessionStorage.setItem(ADJ_KEY, password);
    } catch (error) {
      console.error("Unable to save adjuster session:", error);
    }
  },

  clear: (): void => {
    if (typeof window === "undefined") return;

    try {
      window.sessionStorage.removeItem(ADJ_KEY);
    } catch (error) {
      console.error("Unable to clear adjuster session:", error);
    }
  },
};

export function attemptKey(): string {
  if (typeof window === "undefined") {
    throw new Error("attemptKey() can only be called in the browser.");
  }

  try {
    let key = window.localStorage.getItem(ATTEMPT_KEY);

    if (!key) {
      key = crypto.randomUUID();
      window.localStorage.setItem(ATTEMPT_KEY, key);
    }

    return key;
  } catch {
    // Fallback when browser storage is unavailable.
    return crypto.randomUUID();
  }
}

export const api = {
  verifyPolicy: (data: {
    policyNumber: string;
    registration: string;
    mobile: string;
    incidentDate: string;
  }) =>
    fn.verifyPolicy({
      data: {
        ...data,
        attemptKey: attemptKey(),
      },
    }),

  uploadMedia: (claimId: string, image: PreparedImage) =>
    fn.uploadMedia({
      data: {
        claimId,
        base64: image.base64,
        fileName: image.name,
        source: image.source,
        phash: image.phash,
        quality: image.quality,
        exif: image.exif,
      },
    }),

  deleteMedia: (claimId: string, mediaId: string) =>
    fn.deleteMedia({
      data: { claimId, mediaId },
    }),

  assess: (claimId: string) =>
    fn.assessClaim({
      data: { claimId },
    }),

  getClaim: (claimId: string) =>
    fn.getClaim({
      data: { claimId },
    }),

  getOffer: (claimId: string) =>
    fn.getOffer({
      data: { claimId },
    }),

  chat: (claimId: string, text: string) =>
    fn.sendChat({
      data: { claimId, text },
    }),

  sendToAdjuster: (claimId: string) =>
    fn.sendToAdjuster({
      data: { claimId },
    }),

  getAudit: (claimId: string, adjusterPassword?: string) =>
    fn.getAudit({
      data: { claimId, adjusterPassword },
    }),

  adjusterLogin: (password: string) =>
    fn.adjusterLogin({
      data: { password },
    }),

  listEscalations: (password: string) =>
    fn.listEscalations({
      data: { password },
    }),

  getAdjusterClaim: (password: string, claimId: string) =>
    fn.getAdjusterClaim({
      data: { password, claimId },
    }),

  adjusterAction: (data: {
    password: string;
    claimId: string;
    action: "approve" | "set_amount" | "request_photos" | "close";
    amount?: number;
    note?: string;
  }) =>
    fn.adjusterAction({
      data,
    }),

  evaluation: () => fn.getEvaluation(),
};