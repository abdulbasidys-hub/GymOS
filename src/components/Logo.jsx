import { useState } from "react";
import { useTheme } from "../theme";
import logo from "../assets/logo.png";
import logoDark from "../assets/logo-dark.png";

// Two files, one mark. The logo is two-tone — a near-black ring plus a
// green leg — and the black half disappears against the dark theme's
// near-black surfaces. logo-dark.png is the same artwork with ONLY the
// black inverted to near-white; the green is byte-identical between the
// two files, so the brand colour never shifts when the theme does. It's
// generated from public/logo.png rather than drawn separately (see
// BUILD.md §19): every pixel is scored on how green it is, green pixels
// pass through untouched, non-green pixels get inverted, and the
// anti-aliased boundary in between blends the two — which is why the
// edges stay clean instead of showing a halo of stray inverted pixels.
// Regenerate it if the source logo ever changes.
//
// `effective` (not `preference`) is the right signal here — it resolves
// "system" down to the light/dark actually on screen, so the mark follows
// an OS-level theme change with no explicit choice made.
//
// Imported from src/assets/ (not referenced by a raw "/logo.png" string)
// so Vite processes them as real module assets — a plain absolute path
// resolves fine on real HTTP hosting but not under Electron's file://
// load, where it 404s and silently falls back to the plain-text logo
// below. `size` is the pixel height of the image. `iconOnly` is for spots
// that already show the "GymOS" name as separate text alongside this
// component — it swaps the wordmark fallback for a bare mark so the name
// doesn't render twice.
export default function Logo({ size = 32, className = "", iconOnly = false }) {
  const [failed, setFailed] = useState(false);
  const { effective } = useTheme();

  if (failed) {
    if (iconOnly) {
      return (
        <span
          className={`logo-icon-fallback ${className}`}
          style={{ width: size, height: size, fontSize: size * 0.55 }}
          aria-hidden="true"
        >
          G
        </span>
      );
    }
    return (
      <span className={`logo-word ${className}`}>
        Gym<span className="logo-word__accent">OS</span>
      </span>
    );
  }

  return (
    <img
      src={effective === "dark" ? logoDark : logo}
      alt="GymOS"
      className={`logo-img ${className}`}
      style={{ height: size }}
      onError={() => setFailed(true)}
    />
  );
}
