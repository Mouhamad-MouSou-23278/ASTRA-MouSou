"""Build ASTRA's Mars terrain assets from real HiRISE data (Jezero Crater).

Source product (NASA/JPL-Caltech/University of Arizona, HiRISE):
    DTEEC_045994_1985_046060_1985_U01   1 m/post digital terrain model
    ESP_045994_1985_RED_C_01_ORTHO      1 m/px orthorectified RED image

The scene is centred on the Mars 2020 Perseverance touchdown point
("Octavia E. Butler Landing", 18.4447 N, 77.4508 E), which lies inside this DTM.

Outputs (written to --out-dir):
    near_height.bin   uint16 LE, 513x513, 1 m/post, 512 m x 512 m
    far_height.bin    uint16 LE, 193x193, 16 m/post, 3072 m x 3072 m
    near_ortho.jpg    1024x1024 grayscale, contrast-stretched real imagery
    far_ortho.jpg     2048x2048 grayscale, contrast-stretched real imagery
    terrain.json      geometry + decoding metadata used by backend and frontend
    provenance.json   machine-readable provenance manifest (real vs procedural)

Only the rows of the DTM that the scene needs are fetched (HTTP range
requests against the uncompressed PDS3 raster), so no 380 MB download is needed.

Usage:
    python -I tools/terrain/build_terrain.py \
        --raw-dir data/raw/hirise_dtm_045994 --out-dir backend/assets/terrain
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None  # the ortho is ~95 MP; it is a trusted-size known product

BASE_URL = (
    "https://hirise.lpl.arizona.edu/PDS/DTM/ESP/ORB_045900_045999/"
    "ESP_045994_1985_ESP_046060_1985"
)
DTM_NAME = "DTEEC_045994_1985_046060_1985_U01.IMG"
ORTHO_NAME = "ESP_045994_1985_RED_C_01_ORTHO.JP2"
USER_AGENT = "astra-terrain-builder/1.0"

# Mars 2020 Perseverance touchdown, planetocentric latitude / east longitude.
SITE_NAME = "Octavia E. Butler Landing, Jezero Crater"
SITE_LAT = 18.4447
SITE_LON = 77.4508

NEAR_SIZE_M = 512.0
NEAR_N = 513            # 1 m/post
FAR_SIZE_M = 3072.0     # largest square around the site with zero no-data cells
FAR_N = 193             # 16 m/post
BLEND_M = 32.0          # near border is blended onto the far surface over this width
ROW_MARGIN = 160        # extra DTM rows fetched above/below the far window


def fetch_range(url: str, start: int, end: int, dest: Path) -> None:
    """Resumable ranged download of bytes [start, end] (inclusive) into dest."""
    total = end - start + 1
    have = dest.stat().st_size if dest.exists() else 0
    if have > total:
        dest.unlink()
        have = 0
    attempt = 0
    while have < total:
        req = urllib.request.Request(
            url,
            headers={"Range": f"bytes={start + have}-{end}", "User-Agent": USER_AGENT},
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp, open(dest, "ab") as out:
                if resp.status != 206:
                    raise RuntimeError(f"server ignored Range request (HTTP {resp.status})")
                while True:
                    chunk = resp.read(1 << 20)
                    if not chunk:
                        break
                    out.write(chunk)
                    have += len(chunk)
            attempt = 0
        except Exception as exc:  # network drop: resume from current size
            attempt += 1
            if attempt > 8:
                raise RuntimeError(f"download failed after retries: {exc}") from exc
            have = dest.stat().st_size if dest.exists() else 0
            print(f"  retry {attempt} at {have / 1e6:.1f} MB ({exc})", flush=True)
            time.sleep(min(2 ** attempt, 20))
        print(f"  {have / 1e6:7.1f} / {total / 1e6:.1f} MB", flush=True)


def fetch_file(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        size = int(resp.headers["Content-Length"])
    if dest.exists() and dest.stat().st_size == size:
        return
    fetch_range(url, 0, size - 1, dest)


def parse_label(text: str) -> dict[str, float]:
    def num(key: str) -> float:
        m = re.search(rf"^\s*{re.escape(key)}\s*=\s*([-+0-9.eE]+)", text, re.MULTILINE)
        if not m:
            raise ValueError(f"PDS label key not found: {key}")
        return float(m.group(1))

    return {
        "record_bytes": num("RECORD_BYTES"),
        "image_record": num("^IMAGE"),
        "lines": num("LINES"),
        "line_samples": num("LINE_SAMPLES"),
        "map_resolution": num("MAP_RESOLUTION"),
        "map_scale": num("MAP_SCALE"),
        "line_offset": num("LINE_PROJECTION_OFFSET"),
        "sample_offset": num("SAMPLE_PROJECTION_OFFSET"),
        "center_lat": num("CENTER_LATITUDE"),
        "center_lon": num("CENTER_LONGITUDE"),
    }


def bilinear(grid: np.ndarray, rows: np.ndarray, cols: np.ndarray) -> np.ndarray:
    r0 = np.clip(np.floor(rows).astype(np.int64), 0, grid.shape[0] - 2)
    c0 = np.clip(np.floor(cols).astype(np.int64), 0, grid.shape[1] - 2)
    fr = np.clip(rows - r0, 0.0, 1.0)
    fc = np.clip(cols - c0, 0.0, 1.0)
    top = grid[r0, c0] * (1 - fc) + grid[r0, c0 + 1] * fc
    bot = grid[r0 + 1, c0] * (1 - fc) + grid[r0 + 1, c0 + 1] * fc
    return top * (1 - fr) + bot * fr


def fill_missing(grid: np.ndarray) -> tuple[np.ndarray, int]:
    """Replace PDS missing-constant cells by iterative neighbour averaging."""
    bad = ~np.isfinite(grid) | (grid < -1.0e30)
    count = int(bad.sum())
    if count == 0:
        return grid, 0
    out = grid.copy()
    out[bad] = np.nan
    for _ in range(64):
        nan = np.isnan(out)
        if not nan.any():
            break
        padded = np.pad(out, 1, mode="edge")
        stack = np.stack(
            [padded[:-2, 1:-1], padded[2:, 1:-1], padded[1:-1, :-2], padded[1:-1, 2:]]
        )
        mean = np.nanmean(stack, axis=0)
        out[nan] = mean[nan]
    out[np.isnan(out)] = np.nanmean(out)
    return out, count


def encode_u16(heights: np.ndarray) -> tuple[np.ndarray, float, float]:
    lo = float(heights.min())
    hi = float(heights.max())
    span = max(hi - lo, 1e-6)
    q = np.round((heights - lo) / span * 65535.0).astype("<u2")
    return q, lo, hi


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--raw-dir", required=True, type=Path)
    ap.add_argument("--out-dir", required=True, type=Path)
    ap.add_argument("--preview", type=Path, default=None, help="optional shaded-relief PNG")
    args = ap.parse_args()
    raw: Path = args.raw_dir
    out: Path = args.out_dir
    raw.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)

    # 1. PDS label -------------------------------------------------------------
    head = raw / "dtm_label_head.txt"
    if not head.exists() or head.stat().st_size < 16384:
        print("Fetching DTM label ...")
        fetch_range(f"{BASE_URL}/{DTM_NAME}", 0, 16383, head)
    label = parse_label(head.read_bytes().decode("latin-1"))
    rec = int(label["record_bytes"])
    n_lines = int(label["lines"])
    n_samples = int(label["line_samples"])
    scale = label["map_scale"]                      # metres per pixel
    res = label["map_resolution"]                   # pixels per degree (at centre latitude)
    assert rec == n_samples * 4, "unexpected record size for 32-bit raster"

    # Equirectangular (PDS convention), planetocentric latitude:
    center_line = label["line_offset"] - SITE_LAT * res
    center_sample = label["sample_offset"] + (SITE_LON - label["center_lon"]) * res * math.cos(
        math.radians(label["center_lat"])
    )
    print(f"Site pixel: line {center_line:.1f}, sample {center_sample:.1f} of {n_lines}x{n_samples}")

    half_far_px = (FAR_SIZE_M / 2) / scale
    need0 = max(0, int(math.floor(center_line - half_far_px)) - ROW_MARGIN)
    need1 = min(n_lines, int(math.ceil(center_line + half_far_px)) + ROW_MARGIN)
    if center_sample - half_far_px < 0 or center_sample + half_far_px > n_samples - 1:
        raise SystemExit("far window exceeds DTM width; reduce FAR_SIZE_M")

    # 2. DTM strip (reuse any complete cached strip that covers the rows) -------
    image_offset = (int(label["image_record"]) - 1) * rec
    row0 = row1 = -1
    strip_path = None
    for cached in sorted(raw.glob("dtm_rows_*_*.f32")):
        m = re.fullmatch(r"dtm_rows_(\d+)_(\d+)\.f32", cached.name)
        if not m:
            continue
        a, b = int(m.group(1)), int(m.group(2))
        if a <= need0 and b >= need1 and cached.stat().st_size == (b - a) * rec:
            row0, row1, strip_path = a, b, cached
            break
    if strip_path is None:
        row0, row1 = need0, need1
        strip_path = raw / f"dtm_rows_{row0}_{row1}.f32"
        start = image_offset + row0 * rec
        end = image_offset + row1 * rec - 1
        print(f"Fetching DTM rows {row0}..{row1} ({(end - start + 1) / 1e6:.0f} MB) ...")
        fetch_range(f"{BASE_URL}/{DTM_NAME}", start, end, strip_path)
    full = np.memmap(strip_path, dtype="<f4", mode="r", shape=(row1 - row0, n_samples))

    # Crop to the far window (plus a small margin) before any processing, so the
    # no-data margins of the slanted DTM footprint never enter the scene.
    pad = 24
    wr0 = int(math.floor(center_line - half_far_px)) - pad
    wr1 = int(math.ceil(center_line + half_far_px)) + pad
    wc0 = int(math.floor(center_sample - half_far_px)) - pad
    wc1 = int(math.ceil(center_sample + half_far_px)) + pad
    strip = np.array(full[wr0 - row0:wr1 - row0, wc0:wc1], dtype=np.float64)
    strip, missing = fill_missing(strip)
    print(f"DTM window rows {wr0}..{wr1}, cols {wc0}..{wc1}: {missing} missing cells filled")
    row0, col0 = wr0, wc0   # origin of `strip` in full-raster pixel coordinates

    # 3. Height grids ----------------------------------------------------------
    def sample_heights(n: int, size_m: float, source: np.ndarray, src_scale: float,
                       src_row0: float, src_col0: float) -> np.ndarray:
        # Grid row 0 = north edge, col 0 = west edge.
        offs = np.linspace(-size_m / 2, size_m / 2, n)
        east, south = np.meshgrid(offs, offs)
        rows = (center_line + south / scale - src_row0) / src_scale
        cols = (center_sample + east / scale - src_col0) / src_scale
        return bilinear(source, rows, cols)

    origin_elev = float(
        bilinear(strip, np.array([center_line - row0]), np.array([center_sample - col0]))[0]
    )

    # Far grid: box-average 8x8 first so the 16 m posts are anti-aliased.
    k = 8
    rr = (strip.shape[0] // k) * k
    cc = (strip.shape[1] // k) * k
    coarse = strip[:rr, :cc].reshape(rr // k, k, cc // k, k).mean(axis=(1, 3))
    # Cell (i, j) of `coarse` is centred on strip pixel (i*k + (k-1)/2, j*k + (k-1)/2).
    far = sample_heights(FAR_N, FAR_SIZE_M, coarse, float(k),
                         row0 + (k - 1) / 2, col0 + (k - 1) / 2)
    far -= origin_elev

    near = sample_heights(NEAR_N, NEAR_SIZE_M, strip, 1.0, float(row0), float(col0))
    near -= origin_elev

    # Blend the near border onto the far surface so both meshes stitch without cracks.
    offs = np.linspace(-NEAR_SIZE_M / 2, NEAR_SIZE_M / 2, NEAR_N)
    east, south = np.meshgrid(offs, offs)
    far_step = FAR_SIZE_M / (FAR_N - 1)
    far_on_near = bilinear(far, (south + FAR_SIZE_M / 2) / far_step, (east + FAR_SIZE_M / 2) / far_step)
    edge = NEAR_SIZE_M / 2 - np.maximum(np.abs(east), np.abs(south))
    t = np.clip(edge / BLEND_M, 0.0, 1.0)
    w = t * t * (3 - 2 * t)
    near = near * w + far_on_near * (1 - w)

    near_q, near_lo, near_hi = encode_u16(near)
    far_q, far_lo, far_hi = encode_u16(far)
    near_q.tofile(out / "near_height.bin")
    far_q.tofile(out / "far_height.bin")

    gy, gx = np.gradient(near, 1.0)
    slope_deg = np.degrees(np.arctan(np.hypot(gx, gy)))
    print(f"Near: {near_lo:.2f}..{near_hi:.2f} m rel, slope mean {slope_deg.mean():.2f} deg, "
          f"p95 {np.percentile(slope_deg, 95):.2f} deg")
    print(f"Far:  {far_lo:.2f}..{far_hi:.2f} m rel; site elevation {origin_elev:.2f} m (MOLA datum)")

    # 4. Orthoimage ------------------------------------------------------------
    ortho_path = raw / ORTHO_NAME
    print("Checking orthoimage ...")
    fetch_file(f"{BASE_URL}/{ORTHO_NAME}", ortho_path)
    ortho = Image.open(ortho_path)
    assert ortho.size == (n_samples, n_lines), f"ortho grid {ortho.size} != DTM grid"

    def crop_ortho(size_m: float, px: int) -> tuple[Image.Image, tuple[float, float]]:
        half = (size_m / 2) / scale
        box = (center_sample - half, center_line - half, center_sample + half, center_line + half)
        ibox = tuple(int(round(v)) for v in box)
        tile = np.asarray(ortho.crop(ibox).convert("L"), dtype=np.float64)
        lo, hi = np.percentile(tile[tile > 0], [0.5, 99.5]) if (tile > 0).any() else (0.0, 255.0)
        stretched = np.clip((tile - lo) / max(hi - lo, 1e-6), 0.0, 1.0) * 255.0
        img = Image.fromarray(stretched.astype(np.uint8), mode="L").resize((px, px), Image.LANCZOS)
        return img, (float(lo), float(hi))

    near_img, near_stretch = crop_ortho(NEAR_SIZE_M, 1024)
    far_img, far_stretch = crop_ortho(FAR_SIZE_M, 2048)
    near_img.save(out / "near_ortho.jpg", quality=90)
    far_img.save(out / "far_ortho.jpg", quality=88)

    # 5. Metadata --------------------------------------------------------------
    terrain = {
        "label": "Real Mars topography (HiRISE DTM) - processed for ASTRA",
        "site": {"name": SITE_NAME, "lat_deg": SITE_LAT, "lon_deg_east": SITE_LON,
                 "elevation_m_mola": round(origin_elev, 3)},
        "coordinates": "x = east (m), y = north (m), origin at site; heights relative to site elevation",
        "grid_order": "row 0 = north edge, column 0 = west edge, little-endian uint16",
        "near": {"file": "near_height.bin", "n": NEAR_N, "size_m": NEAR_SIZE_M,
                 "min_m": round(near_lo, 4), "max_m": round(near_hi, 4),
                 "texture": "near_ortho.jpg", "border_blend_m": BLEND_M},
        "far": {"file": "far_height.bin", "n": FAR_N, "size_m": FAR_SIZE_M,
                "min_m": round(far_lo, 4), "max_m": round(far_hi, 4),
                "texture": "far_ortho.jpg"},
    }
    (out / "terrain.json").write_text(json.dumps(terrain, indent=2), encoding="utf-8")

    provenance = {
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "generator": "tools/terrain/build_terrain.py",
        "site": terrain["site"],
        "real_data": [
            {
                "asset": ["near_height.bin", "far_height.bin"],
                "product_id": "DTEEC_045994_1985_046060_1985_U01",
                "kind": "HiRISE stereo digital terrain model, 1 m/post, MOLA-referenced elevations",
                "source_images": ["ESP_045994_1985", "ESP_046060_1985"],
                "url": f"{BASE_URL}/{DTM_NAME}",
                "catalog_page": "https://www.uahirise.org/dtm/ESP_045994_1985",
                "credit": "NASA/JPL-Caltech/University of Arizona; DTM produced by USGS Astrogeology / University of Arizona",
                "raster_window": {"rows": [wr0, wr1], "cols": [wc0, wc1]},
                "missing_cells_filled": missing,
                "map_scale_m_per_px": scale,
            },
            {
                "asset": ["near_ortho.jpg", "far_ortho.jpg"],
                "product_id": "ESP_045994_1985_RED_C_01_ORTHO",
                "kind": "HiRISE orthorectified RED-filter image, 1 m/px (panchromatic)",
                "url": f"{BASE_URL}/{ORTHO_NAME}",
                "credit": "NASA/JPL-Caltech/University of Arizona",
                "contrast_stretch_dn": {"near": near_stretch, "far": far_stretch},
            },
        ],
        "processing": [
            "DTM rows fetched by HTTP range request from the uncompressed PDS3 raster (PC_REAL 32-bit).",
            "Near grid: bilinear resampling to an exact 1.0 m grid (513x513, 512 m).",
            f"Far grid: 8x8 box average then bilinear resampling to 16 m posts ({FAR_N}x{FAR_N}, {FAR_SIZE_M:.0f} m).",
            f"Outer {BLEND_M:.0f} m of the near grid blended onto the far surface for crack-free stitching.",
            "Heights stored relative to the site elevation and quantised to uint16 per grid.",
            "Orthoimage cropped to both windows, 0.5-99.5 percentile contrast stretch, Lanczos resize.",
        ],
        "procedural_not_real": [
            "Surface colour: the RED orthoimage is panchromatic; the butterscotch/ochre tint is applied in the shader.",
            "Sub-metre surface detail (noise bump/grain) added in the shader below DTM resolution.",
            "Scattered rocks, lander, astronaut, waypoint markers, sky, dust haze and lighting are synthetic.",
            "The lander is a generic vehicle placed at the Perseverance touchdown coordinates; it is not a model of any real spacecraft.",
        ],
        "checksums_sha256": {
            name: sha256(out / name)
            for name in ("near_height.bin", "far_height.bin", "near_ortho.jpg", "far_ortho.jpg", "terrain.json")
        },
    }
    (out / "provenance.json").write_text(json.dumps(provenance, indent=2), encoding="utf-8")

    # 6. Optional preview ------------------------------------------------------
    if args.preview:
        az, alt = math.radians(315), math.radians(35)
        gy, gx = np.gradient(near, 1.0)
        slope = np.arctan(np.hypot(gx, gy))
        aspect = np.arctan2(gy, -gx)
        shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - math.pi / 2 - aspect)
        shade = np.clip(shade, 0, 1)
        img = Image.fromarray((shade * 255).astype(np.uint8), mode="L").resize((1026, 1026))
        args.preview.parent.mkdir(parents=True, exist_ok=True)
        img.save(args.preview)

    print("Terrain assets written to", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
