// src/server/jwt.ts
import { SignJWT, importPKCS8, importSPKI, jwtVerify } from "jose";

const NEXT_PRIV = process.env.NEXT_JWT_PRIVATE_KEY!.replace(/\\n/g, "\n");
const NEXT_PUB = process.env.NEXT_JWT_PUBLIC_KEY!.replace(/\\n/g, "\n");
const COPILOT_PUB = process.env.COPILOT_JWT_PUBLIC_KEY!.replace(/\\n/g, "\n");

const ISS_NEXT = process.env.JWT_ISSUER_NEXT || "next-app";
const AUD_COPILOT = process.env.JWT_AUDIENCE_COPILOT || "copilot-service";
const ISS_COPILOT = process.env.JWT_ISSUER_COPILOT || "copilot-service";
const AUD_NEXT = process.env.JWT_AUDIENCE_NEXT || "next-app";

// Sign JWT when Next talks → Copilot
export async function signForCopilot(payload: Record<string, any>) {
  const key = await importPKCS8(NEXT_PRIV, "Ed25519");
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuer(ISS_NEXT)
    .setAudience(AUD_COPILOT)
    .setExpirationTime("5m")
    .sign(key);
}

// Verify JWT when Copilot talks → Next
export async function verifyFromCopilot(bearer: string) {
  const token = (bearer || "").replace(/^Bearer\s+/i, "");
  const key = await importSPKI(COPILOT_PUB, "Ed25519");
  const { payload } = await jwtVerify(token, key, {
    issuer: ISS_COPILOT,
    audience: AUD_NEXT,
  });
  return payload;
}
