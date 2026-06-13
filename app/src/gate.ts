// Onboarding gate state (North Star §2 onboarding): the user must connect a wallet, sign in (Web3 ->
// Firebase, so per-wallet data + the LLM endpoint are gated), AND pass World ID before entering. World
// ID is mocked in dev (clearly labeled) and uses real IDKit when VITE_WORLDID_APP_ID is set.
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { authState, authRequiredCached, fetchAuthRequired } from "./auth";

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

  const authOk = !authRequired || signedIn;
  return { isConnected, address, verified, signedIn, authRequired, passed: isConnected && authOk && verified };
}
