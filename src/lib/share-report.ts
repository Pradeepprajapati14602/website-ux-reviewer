import crypto from "crypto";

type SharePayload = {
  reviewId: string;
  expiresAt: number;
};

function getSecret(): string {
  const secret = process.env.REPORT_SHARE_SECRET || process.env.NEXTAUTH_SECRET || process.env.LLM_API_KEY;
  if (!secret) {
    throw new Error("REPORT_SHARE_SECRET is not configured.");
  }
  return secret;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf-8");
}

function sign(payloadPart: string): string {
  const secret = getSecret();
  return crypto.createHmac("sha256", secret).update(payloadPart).digest("base64url");
}

export function createPublicReportToken(payload: SharePayload): string {
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signaturePart = sign(payloadPart);
  return `${payloadPart}.${signaturePart}`;
}

export function verifyPublicReportToken(token: string): SharePayload {
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) {
    throw new Error("Invalid report token format.");
  }

  const expectedSignature = sign(payloadPart);
  if (signaturePart !== expectedSignature) {
    throw new Error("Invalid report token signature.");
  }

  const payload = JSON.parse(base64UrlDecode(payloadPart)) as SharePayload;

  if (!payload.reviewId || !payload.expiresAt) {
    throw new Error("Invalid report token payload.");
  }

  if (Date.now() > payload.expiresAt) {
    throw new Error("This report link has expired.");
  }

  return payload;
}
