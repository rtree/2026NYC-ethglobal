import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IntentOS dApp. Reuses ../mock/styles.css as the design system.
// Base RPC override via VITE_BASE_RPC (e.g. an Infura/Alchemy URL). Never commit keys.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, host: true, fs: { allow: ["..", "../mock"] } },
});
