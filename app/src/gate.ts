// Onboarding gate state (North Star §2 onboarding): the user must connect a wallet, sign in (Web3 ->
// Firebase, so per-wallet data + the LLM endpoint are gated), AND pass World ID before entering. World
// ID is mocked in dev (clearly labeled) and uses real IDKit when VITE_WORLDID_APP_ID is set.
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { authState, authRequiredCached, fetchAuthRequired, worldIdRequiredCached } from "./auth";
import { api } from "./api";

const WORLDID_KEY = "intentos:worldid";

export function worldIdVerified(): boolean {
  return sessionStorage.getItem(WORLDID_KEY) === "1";
}

export function setWorldIdVerified(v: boolean) {
  if (v) sessionStorage.setItem(WORLDID_KEY, "1");
  else sessionStorage.removeItem(WORLDID_KEY);
  window.dispatchEvent(new CustomEvent("intentos:gate"));
}

export const WORLDID_APP_ID = import.meta.env.VITE_WORLDID_APP_ID ?? "";
export const WORLDID_ACTION = import.meta.env.VITE_WORLDID_ACTION ?? "intentos-onboarding";

/** Combined gate: wallet connected (+ signed in to Firebase via SIWE) + World ID verified.
 *  Whether sign-in is REQUIRED comes from the SERVER (/api/config), not the client build key, so the
 *  client and server can never disagree (AUTH-002). */
export function useGate() {
  const { isConnected, address } = useAccount();
  const [verified, setVerified] = useState(worldIdVerified());
  const [signedIn, setSignedIn] = useState(!!authState());
  const [authRequired, setAuthRequired] = useState(authRequiredCached());

  useEffect(() => {
    fetchAuthRequired().then(setAuthRequired).catch(() => {});
    const onGate = () => setVerified(worldIdVerified());
    const onAuth = () => {
      setSignedIn(!!authState());
      setAuthRequired(authRequiredCached());
    };
    window.addEventListener("intentos:gate", onGate);
    window.addEventListener("intentos:auth", onAuth);
    return () => {
      window.removeEventListener("intentos:gate", onGate);
      window.removeEventListener("intentos:auth", onAuth);
    };
  }, []);

  // When the SERVER enforces World ID, IT — not a local sessionStorage flag — is the source of truth for
  // "human verified" (plan/110). Sync from /api/worldid/status once we know the mode + sign-in state, so a
  // stale local flag can't pre-pass the gate, and a real prior verification carries across tabs/reloads.
  useEffect(() => {
    let cancelled = false;
    fetchAuthRequired().finally(async () => {
      if (cancelled || !worldIdRequiredCached()) return; // dev-mock mode keeps the local-flag behavior
      if (!authState()) {
        if (worldIdVerified()) setWorldIdVerified(false); // a local flag can't be trusted before sign-in
        return;
      }
      try {
        const s = await api.worldIdStatus();
        if (!cancelled) setWorldIdVerified(!!s.verified); // dispatches intentos:gate -> setVerified
      } catch {
        /* leave current state; the write-path is still server-gated */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const authOk = !authRequired || signedIn;
  return { isConnected, address, verified, signedIn, authRequired, passed: isConnected && authOk && verified };
}
