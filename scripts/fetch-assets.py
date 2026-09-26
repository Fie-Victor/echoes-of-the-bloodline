"""Download CC0 assets (Poly Haven + three.js examples) into client/public/assets."""
import json, os, urllib.request

opener = urllib.request.build_opener()
opener.addheaders = [("User-Agent", "echoes-of-the-bloodline-asset-fetcher/1.0")]
urllib.request.install_opener(opener)

ROOT = os.path.join(os.path.dirname(__file__), "..", "client", "public", "assets")
RES = "1k"
MODELS = [
    "kite_shield", "namaqualand_cliff_01", "namaqualand_boulder_02", "rock_moss_set_01",
    "stone_fire_pit", "wooden_barrels_01", "wooden_crate_01", "dead_tree_trunk",
    "grass_medium_01", "fern_02", "wooden_lantern_01",
]
TEXTURES = ["aerial_grass_rock", "rock_face"]
HDRI = "qwantani_sunset_puresky"
EXTRA = {
}


def get(url, dest):
    if os.path.exists(dest):
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print("↓", dest)
    urllib.request.urlretrieve(url, dest)


def files(asset):
    with urllib.request.urlopen(f"https://api.polyhaven.com/files/{asset}") as r:
        return json.load(r)


for m in MODELS:
    g = files(m)["gltf"][RES]["gltf"]
    base = os.path.join(ROOT, "models", m)
    get(g["url"], os.path.join(base, f"{m}.gltf"))
    for rel, info in g["include"].items():
        get(info["url"], os.path.join(base, rel))

for t in TEXTURES:
    f = files(t)
    for key, name in (("Diffuse", "diff"), ("nor_gl", "nor"), ("arm", "arm")):
        get(f[key][RES]["jpg"]["url"], os.path.join(ROOT, "textures", t, f"{name}.jpg"))

get(files(HDRI)["hdri"]["2k"]["hdr"]["url"], os.path.join(ROOT, "hdri", f"{HDRI}.hdr"))

for rel, url in EXTRA.items():
    get(url, os.path.join(ROOT, rel))
