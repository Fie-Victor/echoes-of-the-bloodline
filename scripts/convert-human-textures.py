"""Downscale Rocketbox TGA textures to 1K JPG for the browser (requires Pillow)."""
import os
from pathlib import Path

from PIL import Image

ROOT = Path(os.environ.get("ROCKETBOX", "../rocketbox")) / "Assets/Avatars/Professions"
OUT = Path(__file__).resolve().parent.parent / "client/public/assets/humans"
AVATARS = {"sm024": ("Military_Male_02", "_acu"), "m021": ("Sports_Male_01", "")}

OUT.mkdir(parents=True, exist_ok=True)
for prefix, (folder, variant) in AVATARS.items():
    for part in ("body", "head"):
        for kind in ("color", "normal"):
            suffix = variant if kind == "color" else ""
            src = ROOT / folder / "Textures" / f"{prefix}_{part}_{kind}{suffix}.tga"
            Image.open(src).convert("RGB").resize((1024, 1024), Image.LANCZOS).save(OUT / f"{prefix}_{part}_{kind}.jpg", quality=88)
            print("wrote", prefix, part, kind)
