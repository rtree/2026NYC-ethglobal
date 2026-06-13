import { http, createConfig } from "wagmi";
import { base } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { BASE_RPC } from "./config";

// Wallet config. Injected connector (browser wallet) is enough for the demo; the Owner signs
// EIP-7702 authorization + mint + funding. Everything else is read-only or relayer-submitted.
export const wagmiConfig = createConfig({
  chains: [base],
  connectors: [injected()],
  transports: {
    [base.id]: http(BASE_RPC),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
