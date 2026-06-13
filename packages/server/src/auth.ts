// Basic-auth credentials. Prefer Secret Manager `panel-basic-auth` (format "user:pass"); fall back to
// env PANEL_AUTH; for local dev with neither, a default is used (printed at boot, never committed).
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

const sm = new SecretManagerServiceClient();

export async function getBasicAuth(): Promise<string | null> {
  if (process.env.PANEL_AUTH) return process.env.PANEL_AUTH.trim();
  try {
    const [v] = await sm.accessSecretVersion({
      name: "projects/ethglobal-nyc2026-rtree/secrets/panel-basic-auth/versions/latest",
    });
    const s = v.payload?.data?.toString().trim();
    if (s) return s;
  } catch {
    /* secret not set */
  }
  if (process.env.NODE_ENV !== "production") return "admin:intentos-dev";
  return null; // production with no creds configured -> auth disabled is unacceptable, but we don't crash
}
