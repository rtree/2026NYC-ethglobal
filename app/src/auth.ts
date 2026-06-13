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

// Persist the session in sessionStorage so a page reload / navigation keeps the user signed in within
// the tab (otherwise every refresh bounces back to onboarding). Cleared on tab close or sign-out.
const SESSION_KEY = "intentos:auth";

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return s && s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

let session: Session | null = loadSession();

function persist() {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function authState(): { uid: string; address: string } | null {
  return session ? { uid: session.uid, address: session.address } : null;
}

// Whether the SERVER gates /api/* with Firebase auth. This is the single source of truth (the client
// must NOT decide from its own VITE_FIREBASE_API_KEY, or the two can disagree — AUTH-002). Cached after
// first fetch; falls back to the client key heuristic only if /api/config is unreachable.
let serverAuthRequired: boolean | null = null;
let authConfigPromise: Promise<boolean> | null = null;

export function authRequiredCached(): boolean {
  return serverAuthRequired ?? !!FIREBASE_API_KEY;
}

export async function fetchAuthRequired(): Promise<boolean> {
  if (serverAuthRequired !== null) return serverAuthRequired;
  if (!authConfigPromise) {
    authConfigPromise = fetch("/api/config")
      .then((r) => (r.ok ? (r.json() as Promise<{ authRequired?: boolean }>) : Promise.reject(new Error(String(r.status)))))
      .then((c) => {
        serverAuthRequired = !!c.authRequired;
        window.dispatchEvent(new CustomEvent("intentos:auth"));
        return serverAuthRequired;
      })
      .catch(() => {
        serverAuthRequired = !!FIREBASE_API_KEY; // fall back so dev/e2e still work without /api/config
        return serverAuthRequired;
      });
  }
  return authConfigPromise;
}

/** Bearer for /api/*, refreshing if near expiry. Null when not signed in. */
export async function bearer(): Promise<string | null> {
  if (!session) return null;
  if (session.exp - 60_000 < Date.now()) {
    try {
      await refresh();
    } catch {
      session = null;
      persist();
      return null;
    }
  }
  return session?.idToken ?? null;
}

export function signOut() {
  session = null;
  persist();
  window.dispatchEvent(new CustomEvent("intentos:auth"));
}

type SignMessage = (args: { account: Address; message: string }) => Promise<`0x${string}`>;

// Dedupe concurrent sign-ins for the same address. Onboarding mounts TWO WalletButtons (TopBar + card),
// and each could trigger sign-in; without this, two handshakes race, the server's per-address nonce is
// overwritten by the second GET, and the first POST fails with "nonce mismatch". Concurrent callers
// share one in-flight handshake.
let inFlight: { address: string; promise: Promise<void> } | null = null;

/** Run the full handshake (deduped per address). `signMessageAsync` comes from wagmi's useSignMessage. */
export function signInWithWallet(address: Address, signMessageAsync: SignMessage): Promise<void> {
  const key = address.toLowerCase();
  if (inFlight && inFlight.address === key) return inFlight.promise;
  if (authState()) return Promise.resolve();
  const promise = doSignIn(address, signMessageAsync).finally(() => {
    if (inFlight && inFlight.address === key) inFlight = null;
  });
  inFlight = { address: key, promise };
  return promise;
}

async function doSignIn(address: Address, signMessageAsync: SignMessage): Promise<void> {
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
    // No client Firebase key. Only safe when the SERVER also has auth off — otherwise we'd create an
    // empty-token "signed in" session that 401s every write (AUTH-002). Ask the server and fail loudly
    // on the misconfiguration instead of pretending to be signed in.
    const required = await fetchAuthRequired();
    if (required) {
      throw new Error(
        "This deployment requires sign-in, but the app was built without VITE_FIREBASE_API_KEY. Rebuild the app with the Firebase web config.",
      );
    }
    // server auth is OFF (dev): an empty local session is accepted because the server ignores tokens
    session = { uid, address: addr, idToken: "", refreshToken: "", exp: Date.now() + 3_600_000 };
    persist();
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
  persist();
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
  persist();
}
