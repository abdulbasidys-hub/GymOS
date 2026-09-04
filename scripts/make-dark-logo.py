# Regenerates the dark-theme logo (and its favicon copy) from the single
# source logo, so the two versions can never drift apart.
#
#     pip install Pillow
#     python scripts/make-dark-logo.py
#
# Run this whenever public/logo.png changes. Both outputs are committed
# files, not build artifacts — Vite imports src/assets/logo-dark.png as a
# module asset (see src/components/Logo.jsx for why src/assets/ and not
# public/), and index.html points a prefers-color-scheme favicon link at
# public/favicon-dark.png.
#
# What it does: the mark is two-tone — a near-black ring plus a green leg —
# and only the black half should flip for dark mode. Inverting the whole
# image would turn the green magenta. So every pixel is scored on how green
# it is, green is passed through untouched, everything else is inverted,
# and the anti-aliased boundary between the two blends proportionally.
#
# GREEN_FULL is the greenness score at which a pixel counts as fully green
# and is preserved exactly. It sits well below the solid green's actual
# score (~106) on purpose: that headroom is what keeps the solid fill
# byte-identical to the source while still leaving a gradient for edge
# pixels. Raise it and the green shifts; drop it to 0 and the edges get a
# hard, aliased seam.

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public" / "logo.png"
OUTPUTS = [ROOT / "src" / "assets" / "logo-dark.png", ROOT / "public" / "favicon-dark.png"]

GREEN_FULL = 60.0


def greenness(r, g, b):
    """How green a pixel is: how far g rises above BOTH other channels."""
    return g - max(r, b)


def invert_non_green(image):
    image = image.convert("RGBA")
    width, height = image.size
    src = image.load()
    out = Image.new("RGBA", (width, height))
    dst = out.load()

    for y in range(height):
        for x in range(width):
            r, g, b, a = src[x, y]
            if a == 0:
                dst[x, y] = (0, 0, 0, 0)
                continue
            keep = min(1.0, max(0.0, greenness(r, g, b) / GREEN_FULL))
            dst[x, y] = (
                round(keep * r + (1 - keep) * (255 - r)),
                round(keep * g + (1 - keep) * (255 - g)),
                round(keep * b + (1 - keep) * (255 - b)),
                a,
            )
    return out


def main():
    result = invert_non_green(Image.open(SOURCE))
    for path in OUTPUTS:
        result.save(path)
        print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
