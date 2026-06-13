// Web3 -> Firebase Auth (browser side, no firebase SDK). After the wallet connects, we run the SIWE
// handshake against our server (which mints a Firebase custom token), exchange it for a Firebase ID
// token via the Identity Toolkit REST endpoint, and keep the ID token in memory as the Bearer for
// /api/* (plan/010 §17). VITE_FIREBASE_API_KEY is public-by-design (restricted to identitytoolkit +
// securetoken). When the server runs with INTENTOS_AUTH=off, /api/* ignores the token anyway.
import type { Address } from "viem";

export const FIREBASE_API_KEY = import.meta.env.VITE_FIREBASE_API_KEY ?? "";
export const FIREBASE_PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "";

interface Session {
  uid: string;
  address: string;
  idToken: string;
  refreshToken: string;
  exp: number; // epoch ms
}

let session: Session | null = null;

export function authState(): { uid: string; address: string } | null {
  return session ? { uid: session.uid, address: session.address } : null;
}

/** Bearer for /api/*, refreshing if near expiry. Null when not signed in. */
export async function bearer(): Promise<string | null> {
  if (!session) return null;
  if (session.exp - 60_000 < Date.now()) {
    try {
      await refresh();
    } catch {
      session = null;
      return null;
    }
  }
  return session?.idToken ?? null;
}

export function signOut() {
  session = null;
  window.dispatchEvent(new CustomEvent("intentos:auth"));
}

type SignMessage = (args: { account: Address; message: string }) => Promise<`0x${string}`>;

/** Run the full handshake. `signMessageAsync` comes from wagmi's useSignMessage. */
export async function signInWithWallet(address: Address, signMessageAsync: SignMessage): Promise<void> {
  // 1) nonce + the exact message to sign
  const nonceRes = await fetch(`/api/auth/nonce?address=${address}`);
  if (!nonceRes.ok) throw new Error(`nonce ${nonceRes.status}`);
  const { message } = (await nonceRes.json()) as { nonce: string; message: string };

  // 2) wallet signs
  const signature = await signMessageAsync({ account: address, message });

  // 3) server verifies -> Firebase custom token
  const web3Res = await fetch("/api/auth/web3", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  if (!web3Res.ok) {
    const e = (await web3Res.json().catch(() => ({}))) as { error?: string };
    throw new Error(e.error ?? `web3 ${web3Res.status}`);
  }
  const { customToken, uid, address: addr } = (await web3Res.json()) as {
    customToken: string;
    uid: string;
    address: string;
  };

  // 4) exchange custom token for a Firebase ID token (Identity Toolkit REST)
  if (!FIREBASE_API_KEY) {
    // Auth is off on the server side (dev): record a local session so the UI shows "signed in".
    session = { uid, address: addr, idToken: "", refreshToken: "", exp: Date.now() + 3_600_000 };
    window.dispatchEvent(new CustomEvent("intentos:auth"));
    return;
  }
  const exch = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  if (!exch.ok) throw new Error(`signInWithCustomToken ${exch.status}`);
  const tok = (await exch.json()) as { idToken: string; refreshToken: string; expiresIn: string };
  session = {
    uid,
    address: addr,
    idToken: tok.idToken,
    refreshToken: tok.refreshToken,
    exp: Date.now() + Number(tok.expiresIn) * 1000,
  };
  window.dispatchEvent(new CustomEvent("intentos:auth"));
}

async function refresh(): Promise<void> {
  if (!session?.refreshToken || !FIREBASE_API_KEY) return;
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refreshToken)}`,
  });
  if (!res.ok) throw new Error(`refresh ${res.status}`);
  const tok = (await res.json()) as { id_token: string; refresh_token: string; expires_in: string };
  session = {
    ...session,
    idToken: tok.id_token,
    refreshToken: tok.refresh_token,
    exp: Date.now() + Number(tok.expires_in) * 1000,
  };
}
