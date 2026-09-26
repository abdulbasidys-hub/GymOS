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
  build: {
    rollupOptions: {
      output: {
        // Split the two big third-party lumps out of the app's own chunk.
        //
        // This does NOT reduce what a first-time visitor downloads — the
        // same bytes still arrive, just in three files instead of one. What
        // it changes is every load AFTER that, which is the one a gym
        // actually lives with: these chunks are fingerprinted by content, so
        // React and Firebase keep their filenames across a deploy and stay
        // in the service worker's cache. Before this, shipping a one-line
        // fix changed the hash on all 751KB and every device re-downloaded
        // Firebase to get it.
        //
        // Firebase and React are separated from each other for the same
        // reason at a smaller scale: a Firebase SDK bump should not
        // invalidate React, or the other way round.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@firebase") || id.includes("/firebase/")) return "firebase";
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) {
            return "react";
          }
        },
      },
    },
    // The entry is legitimately large because Firestore is; the warning at
    // 500KB was only ever noise here, and raising it means a real jump in
    // size still gets flagged.
    chunkSizeWarningLimit: 900,
  },
}));
