# Builds the home-screen icons the PWA install needs, from the source logo.
#
#     pip install Pillow
#     python scripts/make-pwa-icons.py
#
# Outputs (all committed, all referenced from public/manifest.webmanifest
# or index.html):
#   public/icon-192.png            192x192  manifest, purpose "any"
#   public/icon-512.png            512x512  manifest, purpose "any"
#   public/icon-maskable-512.png   512x512  manifest, purpose "maskable"
#   public/apple-touch-icon.png    180x180  iOS home screen (index.html)
#
# Why these four and not one file scaled by the browser:
#
# - 192 and 512 are the two sizes Chrome requires before it will offer to
#   install a site at all. Missing either one and the install prompt never
#   appears, with no error saying why.
# - "maskable" is a separate file because Android crops every icon to the
#   launcher's own shape (circle, squircle, rounded square — it varies by
#   device). Only the middle 80% is guaranteed to survive that crop, so the
#   mark is drawn smaller here, well inside the safe circle. Handing the
#   same artwork to both purposes means either the plain icon looks lost in
#   its own padding or the masked one gets its edges shaved off.
# - iOS ignores the manifest's icons entirely and reads
#   <link rel="apple-touch-icon">, which must be a square with NO alpha
#   channel — a transparent PNG comes out with a black background on the
#   home screen. Hence the flatten onto white below.
#
# White background, not transparent: a launcher draws the icon against
# whatever wallpaper the user has, and the logo's black half disappears
# against a dark one. White is also the app's own --bg in its default
# (light) theme, so the icon, the splash screen (manifest background_color)
# and the first painted frame are all the same colour.

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "public" / "logo.png"
OUT = ROOT / "public"

BACKGROUND = (255, 255, 255)

# Fraction of the icon's width the mark spans.
#
# 0.70 for the plain icons: enough breathing room that the mark doesn't
# touch the edges, without the shrunken look of a logo floating in a large
# white field.
#
# 0.54 for the maskable one: the guaranteed-safe region is a circle of 80%
# the icon's width, and a square mark inscribed in that circle can only be
# 80/sqrt(2) = 57% wide. 54% keeps a little margin on top of that, since
# the mark is not perfectly square.
PLAIN_SCALE = 0.70
MASKABLE_SCALE = 0.54


def mark():
    """The logo cropped to its own artwork, with the file's padding removed.

    The source has a few dozen transparent pixels around the mark; leaving
    them in would silently shrink every icon below the scale asked for
    here, differently in each direction.
    """
    im = Image.open(LOGO).convert("RGBA")
    box = im.getchannel("A").getbbox()
    return im.crop(box) if box else im


def build(size, scale, path):
    canvas = Image.new("RGB", (size, size), BACKGROUND)
    art = mark()
    target = int(size * scale)
    # Fit inside a target x target box, preserving the mark's proportions —
    # the logo is very slightly taller than it is wide.
    ratio = min(target / art.width, target / art.height)
    art = art.resize((max(1, round(art.width * ratio)), max(1, round(art.height * ratio))), Image.LANCZOS)
    # Paste with the mark's own alpha as the mask, which is what composites
    # it onto white instead of pasting its transparent pixels as black.
    canvas.paste(art, ((size - art.width) // 2, (size - art.height) // 2), art)
    canvas.save(path, "PNG")
    print(f"wrote {path.relative_to(ROOT)}  {size}x{size}")


if __name__ == "__main__":
    build(192, PLAIN_SCALE, OUT / "icon-192.png")
    build(512, PLAIN_SCALE, OUT / "icon-512.png")
    build(512, MASKABLE_SCALE, OUT / "icon-maskable-512.png")
    build(180, PLAIN_SCALE, OUT / "apple-touch-icon.png")
