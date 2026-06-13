import { useEffect, useState } from "react";
import { Onboarding } from "./Onboarding";
import { IntentList } from "./IntentList";
import { LaunchFlow } from "./LaunchFlow";
import { LiveConsole } from "./LiveConsole";

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return hash;
}

export function App() {
  const hash = useHashRoute();

  // "#/" is the onboarding screen. It owns its own gates and an explicit "Enter" that navigates to
  // "#/intents". We intentionally do NOT auto-redirect here, so the verified state + Enter step are
  // visible and testable (the gate is honest about both steps).
  if (hash === "#/" || hash === "") {
    return <Onboarding />;
  }

  switch (hash) {
    case "#/intents":
      return <IntentList />;
    case "#/launch":
      return <LaunchFlow />;
    case "#/console":
      return <LiveConsole />;
    // Legacy deep links → fold into the new single-screen wizard / console.
    case "#/launch/intent":
    case "#/launch/identity":
    case "#/launch/runtime":
    case "#/launch/watcher":
    case "#/launch/start":
      return <LaunchFlow />;
    case "#/dashboard":
    case "#/watcher":
    case "#/result":
      return <LiveConsole />;
    default:
      return <IntentList />;
  }
}
