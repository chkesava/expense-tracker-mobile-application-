"""
Edge-only matte knockout for Ganesh Seva decorative PNGs.

Flood-fills from the image border so interior highlights (white flowers on
Ganesha, cream stone on the temple) are not punched out. Overwrites the
source files; git is the backup.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "assets" / "branding" / "ganesh"

# Near-white mattes: temple, diya, mandala wash.
WHITE_JOBS = (
    "mandap.png",
    "people-temple.png",
    "diya.png",
    "mandala.png",
)

# Near-black mattes: Ganesha letterbox and the Pandal medallion.
BLACK_JOBS = (
    "god.png",
    "pandal-medallion.png",
)


def is_near_white(r: int, g: int, b: int, threshold: int = 232) -> bool:
    return r >= threshold and g >= threshold and b >= threshold and abs(r - g) < 18 and abs(g - b) < 18


def is_near_black(r: int, g: int, b: int, threshold: int = 28) -> bool:
    return r <= threshold and g <= threshold and b <= threshold


def flood_matte(
    image: Image.Image,
    *,
    kind: str,
    hard: int,
    feather: int,
) -> Image.Image:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    match = is_near_white if kind == "white" else is_near_black

    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def idx(x: int, y: int) -> int:
        return y * width + x

    def enqueue(x: int, y: int) -> None:
        i = idx(x, y)
        if visited[i]:
            return
        r, g, b, a = pixels[x, y]
        if a == 0:
            visited[i] = 1
            return
        if not match(r, g, b, hard):
            return
        visited[i] = 1
        queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)

    matte = set()
    while queue:
        x, y = queue.popleft()
        matte.add((x, y))
        if x > 0:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y > 0:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    for x, y in matte:
        r, g, b, _ = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)

    # Soften the cut against leftover fringe of the same hue.
    if feather > 0:
        for y in range(height):
            for x in range(width):
                r, g, b, a = pixels[x, y]
                if a == 0 or not match(r, g, b, feather):
                    continue
                neighbor_clear = False
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < width and 0 <= ny < height and pixels[nx, ny][3] == 0:
                        neighbor_clear = True
                        break
                if neighbor_clear:
                    pixels[x, y] = (r, g, b, 0)

    return rgba


def report(path: Path, image: Image.Image) -> str:
    rgba = image.convert("RGBA")
    data = list(rgba.getdata())
    n = len(data)
    trans = sum(1 for *_, a in data if a == 0)
    return f"{path.name}: {image.mode} {image.size[0]}x{image.size[1]}  alpha={100 * trans / n:.1f}%"


def process(name: str, kind: str) -> None:
    path = ROOT / name
    before = Image.open(path)
    print("before", report(path, before))
    hard = 232 if kind == "white" else 28
    feather = 244 if kind == "white" else 40
    after = flood_matte(before, kind=kind, hard=hard, feather=feather)
    after.save(path, "PNG", optimize=True)
    print(" after", report(path, after))


def main() -> None:
    for name in WHITE_JOBS:
        process(name, "white")
    for name in BLACK_JOBS:
        process(name, "black")


if __name__ == "__main__":
    main()
