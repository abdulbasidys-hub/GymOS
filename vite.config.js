import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base differs by target, and it has to.
//
// Electron loads the built index.html off the local filesystem, where a
// root-absolute "/assets/..." resolves against the filesystem root and
// 404s — so that build needs relative paths ("./").
//
// The web build must NOT use relative paths. It is served by Vercel with a
// catch-all rewrite (vercel.json), so index.html is returned for routes at
// any depth. A relative "./assets/index-abc.js" resolves against the
// CURRENT URL's directory: fine at "/pricing" (resolves to /assets/...),
// broken at "/owner/members", where it becomes "/owner/assets/..." and
// 404s. Root-absolute "/" is correct for every depth.
//
// Selected by mode: `vite build` (Vercel, and `npm run build`) gets "/",
// `vite build --mode electron` (npm run build:electron, used by
// electron:build) gets "./". `.env` still loads in both modes, so the
// VITE_FIREBASE_* values are unaffected by the mode switch.
export default defineConfig(({ mode }) => ({
  base: mode === "electron" ? "./" : "/",
  plugins: [react()],
}));
