#!/usr/bin/env python3
"""Rebuild the docs and benchmark backdrops from proven sources.

Four photographs are CC0 files on Wikimedia Commons. This script downloads
each file, refuses to write it unless the Commons API reports LicenseShortName
CC0, cover-crops it, and saves WebP with no EXIF. silk.webp is not a
photograph: it is drawn by make_silk() below and is an original file covered
by the repository MIT license.

Run from the repository root:

    python3 scripts/fetch-backdrops.py

Network is required for the four photographs. The committed WebP files are
the output of this script.
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
IMG = ROOT / "docs" / "public" / "img"
BENCH = ROOT / "bench" / "pages" / "lake.webp"
UA = "glassy-liquid-backdrop-fetch/1.0 (license check; https://github.com/9und30/glassy-liquid)"

# Commons file titles. Credits and Unsplash URLs are whatever the API returns
# at download time; this table only pins the file and the crop.
PHOTOS = [
    {
        "title": "File:Iceberg reflection in Jökulsárlón (Unsplash).jpg",
        "out": IMG / "glacier.webp",
        "size": (2048, 1152),
    },
    {
        "title": "File:Turquoise mountain lake 1 (Unsplash).jpg",
        "out": IMG / "lake.webp",
        "size": (2048, 1152),
    },
    {
        "title": "File:Neon streets (Unsplash).jpg",
        "out": IMG / "city.webp",
        "size": (2048, 1152),
    },
    {
        "title": "File:Collection of fruits (Unsplash).jpg",
        "out": IMG / "fruit.webp",
        "size": (1536, 1536),
    },
]


def api(titles: list[str]) -> dict:
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(
        {
            "action": "query",
            "format": "json",
            "prop": "imageinfo",
            "titles": "|".join(titles),
            "iiprop": "url|extmetadata|size|mime",
        }
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.load(resp)
    pages = data.get("query", {}).get("pages", {})
    by_title = {}
    for page in pages.values():
        if "missing" in page:
            raise SystemExit(f"Commons has no {page.get('title')}")
        by_title[page["title"]] = page
    return by_title


def plain(meta: dict, key: str) -> str:
    import re

    raw = (meta.get(key) or {}).get("value") or ""
    return re.sub(r"<[^>]+>", "", raw).replace("\n", " ").strip()


def download(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def cover(im: Image.Image, width: int, height: int) -> Image.Image:
    im = im.convert("RGB")
    scale = max(width / im.width, height / im.height)
    resized = im.resize((round(im.width * scale), round(im.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - width) // 2
    top = (resized.height - height) // 2
    return resized.crop((left, top, left + width, top + height))


def save_webp(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=82, method=6)


def make_silk(width: int = 1152, height: int = 2048) -> Image.Image:
    """Original folded-gradient backdrop. No third-party pixels."""
    ys, xs = np.mgrid[0:height, 0:width].astype(np.float32)
    xn = xs / width
    yn = ys / height
    u = xn * 0.42 + yn * 0.92
    warp = 0.055 * np.sin(xn * 2.4 + yn * 1.3) + 0.028 * np.sin(xn * 6.5 - yn * 2.2)
    t = np.clip(u + warp, 0, 1)
    stops = [
        (0.00, np.array([16, 24, 86], np.float32)),
        (0.38, np.array([78, 32, 118], np.float32)),
        (0.62, np.array([168, 48, 72], np.float32)),
        (1.00, np.array([236, 128, 48], np.float32)),
    ]
    col = np.empty((height, width, 3), np.float32)
    col[:] = stops[0][1]
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        w = np.clip((t - t0) / (t1 - t0), 0, 1)[..., None]
        band = (t >= t0) & (t <= t1)
        col[band] = (c0 * (1 - w) + c1 * w)[band]
    fold = np.sin((u + warp) * 8.5)
    highlight = np.clip(fold, 0, 1) ** 2
    shadow = np.clip(-fold, 0, 1) ** 2
    col = col + highlight[..., None] * np.array([36, 16, 8], np.float32)
    col = col * (1 - 0.28 * shadow[..., None])
    thread = 0.5 + 0.5 * np.sin((xn * 0.2 + yn) * 480)
    col = col * (0.975 + 0.025 * thread[..., None])
    col = np.clip(col, 0, 255).astype(np.uint8)
    image = Image.fromarray(col, "RGB").filter(ImageFilter.GaussianBlur(radius=1.4))
    return image


def lake_probe(path: Path) -> tuple[float, float]:
    """Same center window the streaming backdrop test samples, on the raw photo."""
    lum = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    lum = 0.2126 * lum[:, :, 0] + 0.7152 * lum[:, :, 1] + 0.0722 * lum[:, :, 2]
    xs = [930, 977, 1024, 1070, 1117]
    ys = [469, 515, 562, 608, 655]
    vals = [float(lum[y, x]) for y in ys for x in xs]
    return float(lum[562, 1024]), max(vals) - min(vals)


def main() -> None:
    pages = api([item["title"] for item in PHOTOS])
    for item in PHOTOS:
        page = pages[item["title"]]
        info = page["imageinfo"][0]
        meta = info["extmetadata"]
        license_name = plain(meta, "LicenseShortName")
        if license_name != "CC0":
            raise SystemExit(f"Refusing {item['title']}: Commons says {license_name!r}, not CC0")
        blob = download(info["url"])
        image = cover(Image.open(BytesIO(blob)), *item["size"])
        save_webp(image, item["out"])
        print(
            f"{item['out'].name}: {item['size'][0]}x{item['size'][1]} "
            f"{item['out'].stat().st_size} bytes  {license_name}  {plain(meta, 'Artist')[:60]}"
        )
    silk = make_silk()
    save_webp(silk, IMG / "silk.webp")
    print(f"silk.webp: {silk.size[0]}x{silk.size[1]} {(IMG / 'silk.webp').stat().st_size} bytes  generated")
    BENCH.write_bytes((IMG / "lake.webp").read_bytes())
    center, spread = lake_probe(IMG / "lake.webp")
    print(f"lake center luminance {center:.1f}, inner spread {spread:.1f}, bytes {(IMG / 'lake.webp').stat().st_size}")
    if center <= 35 or spread <= 20:
        raise SystemExit("lake.webp is too flat for the backdrop regression (need center > 35 and spread > 20)")
    if (IMG / "lake.webp").stat().st_size <= 16_384:
        raise SystemExit("lake.webp must stay larger than 16 KiB so the streaming test can stall mid-file")


if __name__ == "__main__":
    main()
