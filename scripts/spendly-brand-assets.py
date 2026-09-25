"""
Spendly brand derivatives (SPENDLY-162).

Source of truth: assets/branding/new_spendly_icon.png, a 1254x1254 RGB
render of the 3D wallet icon: a rounded square sitting on a baked-in dark
navy vignette, with no alpha channel.

assets/branding/new_spendly_icon.svg is kept as the canonical source file
but is NOT a vector: it wraps a single embedded PNG
(<image href="data:image/png;base64,...">) carrying content-credentials
metadata. Nothing here reads it and nothing converts it; if a true vector
arrives later, regenerate these outputs from that instead.

The PNG cannot be used directly:
  * Android adaptive icons mask the foreground to a circle or squircle, which
    crops a full-bleed rounded square.
  * The vignette is not a flat colour (corners range roughly #040D19 to
    #16273A), so the image's square edge shows against any single splash
    background.

Outputs (all written next to the source, overwriting previous runs):
  spendly-icon.png                1024x1024 opaque. The rounded square
                                  cropped to its bounds. For expo.icon (iOS
                                  applies its own mask), the PWA manifest
                                  icon, favicon and the in-app logo.
  spendly-adaptive-foreground.png 1024x1024 RGBA. The rounded square scaled
                                  into Android's adaptive safe zone, edges
                                  feathered to transparent over BRAND_NAVY.
  spendly-splash.png              1024x1024 RGBA. The full artwork with its
                                  vignette feathered to transparent, so it
                                  sits seamlessly on BRAND_NAVY.

Run:  python scripts/spendly-brand-assets.py
"""

from __future__ import annotations

from pathlib import Path
from statistics import median

from PIL import Image, ImageDraw, ImageFilter

BRANDING = Path(__file__).resolve().parents[1] / "assets" / "branding"
SOURCE = BRANDING / "new_spendly_icon.png"

# Sampled from the source's vignette; keep in sync with app.json /
# app.config.js / SplashAnimationOverlay (the script prints the live sample).
BRAND_NAVY = (0x07, 0x14, 0x23)

OUT_SIZE = 1024
# Android adaptive icons: 108dp canvas, of which a 72dp circle is visible on
# round-mask launchers. The rounded square's corners (radius ~25% of its side)
# reach ~1.21x its half-width from the centre, so at 56% of the canvas they
# land at ~340px of 1024 -- just inside the ~341px visible circle. Any larger
# and Pixel-style round masks clip the glowing corners.
ADAPTIVE_SCALE = 0.56
# Luminance above which a pixel belongs to the icon rather than the vignette.
ICON_THRESHOLD = 56


def icon_bounds(img: Image.Image) -> tuple[int, int, int, int]:
    """Bounding box of the rounded square, found by luminance, made square."""
    mask = img.convert("L").point(lambda v: 255 if v > ICON_THRESHOLD else 0)
    left, top, right, bottom = mask.getbbox()
    size = max(right - left, bottom - top)
    cx, cy = (left + right) // 2, (top + bottom) // 2
    half = size // 2
    return cx - half, cy - half, cx - half + size, cy - half + size


def sample_navy(img: Image.Image) -> tuple[int, int, int]:
    """Median colour of a thin border band — the vignette's typical navy."""
    w, h = img.size
    px = img.load()
    band = [px[x, y] for x in range(0, w, 7) for y in (1, 3, h - 4, h - 2)]
    band += [px[x, y] for y in range(0, h, 7) for x in (1, 3, w - 4, w - 2)]
    return tuple(int(median(c[i] for c in band)) for i in range(3))  # type: ignore[return-value]


def rounded_mask(size: int, inset: float, radius: float, feather: float) -> Image.Image:
    """Soft-edged rounded-rectangle alpha mask (all params as fractions of size)."""
    mask = Image.new("L", (size, size), 0)
    pad = int(size * inset)
    ImageDraw.Draw(mask).rounded_rectangle(
        (pad, pad, size - pad, size - pad), radius=int(size * radius), fill=255
    )
    return mask.filter(ImageFilter.GaussianBlur(size * feather))


def main() -> None:
    src = Image.open(SOURCE).convert("RGB")
    bounds = icon_bounds(src)
    print(f"source {src.size}, icon bounds {bounds}")
    print("sampled vignette navy #%02X%02X%02X (BRAND_NAVY #%02X%02X%02X)" % (*sample_navy(src), *BRAND_NAVY))

    # 1. Opaque app icon: the rounded square filling the frame.
    icon = src.crop(bounds).resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
    icon.save(BRANDING / "spendly-icon.png", optimize=True)

    # 2. Adaptive foreground: rounded square inside the safe zone, feathered.
    inner = int(OUT_SIZE * ADAPTIVE_SCALE)
    square = src.crop(bounds).resize((inner, inner), Image.LANCZOS).convert("RGBA")
    square.putalpha(rounded_mask(inner, inset=0.015, radius=0.25, feather=0.015))
    foreground = Image.new("RGBA", (OUT_SIZE, OUT_SIZE), (*BRAND_NAVY, 0))
    offset = (OUT_SIZE - inner) // 2
    foreground.alpha_composite(square, (offset, offset))
    foreground.save(BRANDING / "spendly-adaptive-foreground.png", optimize=True)

    # 3. Splash: whole artwork (keeps the glow), vignette feathered away.
    splash = src.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS).convert("RGBA")
    splash.putalpha(rounded_mask(OUT_SIZE, inset=0.06, radius=0.24, feather=0.035))
    splash.save(BRANDING / "spendly-splash.png", optimize=True)

    for name in ("spendly-icon.png", "spendly-adaptive-foreground.png", "spendly-splash.png"):
        out = BRANDING / name
        print(f"wrote {out.relative_to(BRANDING.parents[1])} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
