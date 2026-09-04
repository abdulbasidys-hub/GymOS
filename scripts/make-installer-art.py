# Builds the NSIS installer's branding images from the source logo, so the
# setup wizard shows the GymOS mark and name instead of NSIS's stock
# "nsis3-metro" artwork.
#
#     pip install Pillow
#     python scripts/make-installer-art.py
#
# Outputs (both committed, both referenced from package.json's build.nsis):
#   build/installerSidebar.bmp    164x314  welcome/finish page panel
#   build/uninstallerSidebar.bmp  164x314  same, for the uninstaller
#
# Why BMP and not PNG: NSIS's MUI2 bitmap slots accept Windows BMP only,
# and the sizes are fixed by the MUI layout — 164x314 for the sidebar. A
# wrong size is not scaled, it is drawn misaligned, so these dimensions are
# not adjustable without changing the page layout itself.
#
# Saved as 24-bit BGR with no alpha: MUI does not composite transparency in
# these slots, so the logo is flattened onto a solid background here rather
# than left with an alpha channel that would render as noise.

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "public" / "logo.png"

WIDTH, HEIGHT = 164, 314
BACKGROUND = (255, 255, 255)
INK = (17, 17, 17)
GREEN = (22, 163, 74)  # --accent, the logo's own green
MUTED = (110, 110, 110)

FONT_DIR = Path("C:/Windows/Fonts")


def load_font(names, size):
    """First available of `names`, falling back to PIL's bitmap default."""
    for name in names:
        path = FONT_DIR / name
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size)
            except OSError:
                continue
    return ImageFont.load_default()


def text_width(draw, text, font):
    return draw.textbbox((0, 0), text, font=font)[2]


def build_sidebar():
    canvas = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(canvas)

    # Logo, centred in the upper portion.
    logo = Image.open(LOGO).convert("RGBA")
    target = 88
    scale = target / max(logo.size)
    logo = logo.resize((max(1, round(logo.width * scale)), max(1, round(logo.height * scale))), Image.LANCZOS)
    logo_x = (WIDTH - logo.width) // 2
    logo_y = 60
    canvas.paste(logo, (logo_x, logo_y), logo)

    # "GymOS" underneath, with OS in the brand green — drawn as two runs so
    # the colour split lands mid-word, which a single draw.text can't do.
    name_font = load_font(["segoeuib.ttf", "arialbd.ttf"], 30)
    gym_w = text_width(draw, "Gym", name_font)
    os_w = text_width(draw, "OS", name_font)
    name_y = logo_y + logo.height + 18
    start_x = (WIDTH - (gym_w + os_w)) // 2
    draw.text((start_x, name_y), "Gym", font=name_font, fill=INK)
    draw.text((start_x + gym_w, name_y), "OS", font=name_font, fill=GREEN)

    # Tagline, matching the app's own lockup.
    tag_font = load_font(["seguisb.ttf", "segoeui.ttf", "arial.ttf"], 11)
    tagline = "Run Your Gym Smarter"
    draw.text(((WIDTH - text_width(draw, tagline, tag_font)) // 2, name_y + 40), tagline, font=tag_font, fill=MUTED)

    # A thin green rule along the bottom edge — keeps the panel from ending
    # in dead white space against the wizard's own grey.
    draw.rectangle([(0, HEIGHT - 4), (WIDTH, HEIGHT)], fill=GREEN)

    return canvas


def main():
    sidebar = build_sidebar()
    for name in ("installerSidebar.bmp", "uninstallerSidebar.bmp"):
        out = ROOT / "build" / name
        sidebar.save(out, format="BMP")
        print(f"wrote {out.relative_to(ROOT)} ({sidebar.width}x{sidebar.height})")


if __name__ == "__main__":
    main()
