import { useEffect, useState } from "react";
import { Onboarding } from "./Onboarding";
import { IntentList } from "./IntentList";
import { LaunchDashboard } from "./LaunchDashboard";
import { LaunchFlow } from "./LaunchFlow";
import { AgentIdentity } from "./AgentIdentity";
import { RuntimeFunding } from "./RuntimeFunding";
import { WatcherCreation } from "./WatcherCreation";
import { Start } from "./Start";
import { OwnerDashboard } from "./OwnerDashboard";
import { WatcherDashboard } from "./WatcherDashboard";
import { ResultScreen } from "./ResultScreen";

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
      return <LaunchDashboard />;
    case "#/launch/intent":
      return <LaunchFlow />;
    case "#/launch/identity":
      return <AgentIdentity />;
    case "#/launch/runtime":
      return <RuntimeFunding />;
    case "#/launch/watcher":
      return <WatcherCreation />;
    case "#/launch/start":
      return <Start />;
    case "#/dashboard":
      return <OwnerDashboard />;
    case "#/watcher":
      return <WatcherDashboard />;
    case "#/result":
      return <ResultScreen />;
    default:
      return <IntentList />;
  }
}
