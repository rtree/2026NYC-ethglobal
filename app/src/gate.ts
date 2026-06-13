// Onboarding gate state (North Star §2 onboarding): the user must connect a wallet AND pass World ID
// human-proof before entering the Intent List. World ID is mocked in dev (clearly labeled) and uses
// real IDKit when VITE_WORLDID_APP_ID is set. The flag persists for the session.
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

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

/** Combined gate: wallet connected + World ID verified. */
export function useGate() {
  const { isConnected, address } = useAccount();
  const [verified, setVerified] = useState(worldIdVerified());

  useEffect(() => {
    const onGate = () => setVerified(worldIdVerified());
    window.addEventListener("intentos:gate", onGate);
    return () => window.removeEventListener("intentos:gate", onGate);
  }, []);

  return { isConnected, address, verified, passed: isConnected && verified };
}
