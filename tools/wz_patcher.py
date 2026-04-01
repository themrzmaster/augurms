#!/usr/bin/env python3
"""
WZ Patcher for AugurMS — Injects custom item icons into client .wz files.

Usage:
  python3 wz_patcher.py --manifest custom_items.json --wz-dir ./client/cosmic-wz --output ./patched

The manifest JSON is exported from the dashboard API: GET /api/admin/items/export
"""

import argparse
import json
import os
import struct
import sys
import zlib
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen

try:
    from PIL import Image
except ImportError:
    print("ERROR: Pillow is required. Install with: pip install Pillow")
    sys.exit(1)


# ── WZ Binary Format Helpers ──

WZ_MAGIC = b"PKG1"

def read_wz_int(f):
    """Read a WZ compressed int."""
    b = struct.unpack("b", f.read(1))[0]
    if b == -128:
        return struct.unpack("<i", f.read(4))[0]
    return b

def write_wz_int(val):
    """Write a WZ compressed int."""
    if -127 <= val <= 126:
        return struct.pack("b", val)
    return struct.pack("b", -128) + struct.pack("<i", val)

def read_wz_string_at_offset(f, offset, wz_key=0):
    """Read a WZ-encoded string."""
    pos = f.tell()
    f.seek(offset)
    s = read_wz_string(f, wz_key)
    f.seek(pos)
    return s

def read_wz_string(f, wz_key=0):
    """Read a WZ string (type-prefixed)."""
    size = struct.unpack("b", f.read(1))[0]
    if size == 0:
        return ""
    if size > 0:
        # Unicode string
        length = size if size != 127 else struct.unpack("<i", f.read(4))[0]
        mask = 0xAAAA
        chars = []
        for _ in range(length):
            c = struct.unpack("<H", f.read(2))[0]
            c ^= mask
            mask += 1
            chars.append(chr(c))
        return "".join(chars)
    else:
        # ASCII string
        length = -size if size != -128 else struct.unpack("<i", f.read(4))[0]
        mask = 0xAA
        chars = []
        for _ in range(length):
            c = struct.unpack("B", f.read(1))[0]
            c ^= mask
            mask += 1
            chars.append(chr(c))
        return "".join(chars)

def write_wz_ascii_string(s):
    """Write a WZ ASCII string."""
    length = len(s)
    buf = BytesIO()
    if length < 128:
        buf.write(struct.pack("b", -length))
    else:
        buf.write(struct.pack("b", -128))
        buf.write(struct.pack("<i", length))
    mask = 0xAA
    for ch in s:
        c = ord(ch) ^ mask
        buf.write(struct.pack("B", c))
        mask = (mask + 1) & 0xFF
    return buf.getvalue()

def write_wz_unicode_string(s):
    """Write a WZ Unicode string."""
    length = len(s)
    buf = BytesIO()
    if length < 127:
        buf.write(struct.pack("b", length))
    else:
        buf.write(struct.pack("b", 127))
        buf.write(struct.pack("<i", length))
    mask = 0xAAAA
    for ch in s:
        c = ord(ch) ^ mask
        buf.write(struct.pack("<H", c))
        mask = (mask + 1) & 0xFFFF
    return buf.getvalue()


# ── PNG to WZ Canvas Conversion ──

def png_to_bgra4444(png_path_or_url):
    """Convert a PNG file to BGRA4444 pixel data (format 1 in WZ).
    Auto-trims transparent borders before conversion."""
    if png_path_or_url.startswith("http"):
        from io import BytesIO as BIO
        data = urlopen(png_path_or_url).read()
        img = Image.open(BIO(data))
    else:
        img = Image.open(png_path_or_url)

    img = img.convert("RGBA")

    # Auto-trim transparent borders
    bbox = img.getbbox()
    if bbox:
        orig_size = img.size
        img = img.crop(bbox)
        if img.size != orig_size:
            print(f"    Trimmed {orig_size[0]}x{orig_size[1]} -> {img.size[0]}x{img.size[1]}")

    width, height = img.size
    pixels = img.load()

    raw = bytearray()
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            # Convert 8-bit channels to 4-bit
            b4 = b >> 4
            g4 = g >> 4
            r4 = r >> 4
            a4 = a >> 4
            # Pack as BGRA4444: low byte = (G4 << 4 | B4), high byte = (A4 << 4 | R4)
            lo = (g4 << 4) | b4
            hi = (a4 << 4) | r4
            raw.append(lo)
            raw.append(hi)

    return width, height, bytes(raw)


def build_canvas_property(width, height, pixel_data):
    """Build a WZ canvas property blob (the content inside an .img)."""
    compressed = zlib.compress(pixel_data)

    buf = BytesIO()

    # Canvas property header
    buf.write(struct.pack("<H", 0))  # unknown, always 0
    buf.write(b"\x01")  # has_property = true... actually for minimal, false

    # Actually, for a minimal icon canvas, the format is:
    # We'll write the simplest possible .img structure
    # that the client can parse.

    return compressed, width, height


def build_img_blob(width, height, pixel_data, icon_raw_w=None, icon_raw_h=None, icon_raw_data=None):
    """
    Build a complete .img binary blob for an equip item with icon and iconRaw.

    The .img format is a property tree:
    - Root: SubProperty "info"
      - Canvas "icon": pixel data
      - Canvas "iconRaw": pixel data
      - Various int/string properties for slots, reqs, stats
    """
    buf = BytesIO()

    # .img header
    buf.write(b"\x73")  # WZ property type marker

    # Write "Property" as WZ string (this identifies it as a property container)
    buf.write(write_wz_ascii_string("Property"))

    buf.write(struct.pack("<H", 0))  # padding

    # Number of entries at root level: 1 (the "info" sub-property)
    buf.write(write_wz_int(1))

    # Entry: "info" SubProperty
    buf.write(b"\x73")  # string type marker
    buf.write(write_wz_ascii_string("info"))
    # Property type for SubProperty
    buf.write(b"\x03")  # SubProperty type
    buf.write(struct.pack("<i", 0))  # size placeholder (will be the blob after this)

    # Now write the "info" sub-property content
    info_start = buf.tell()

    buf.write(struct.pack("<H", 0))  # padding

    # Count entries in info: icon + iconRaw = 2
    entry_count = 2
    buf.write(write_wz_int(entry_count))

    # ── Entry: "icon" Canvas ──
    buf.write(b"\x73")
    buf.write(write_wz_ascii_string("icon"))
    buf.write(b"\x01")  # Canvas type

    # Canvas data
    compressed_icon = zlib.compress(pixel_data)
    buf.write(struct.pack("<H", 0))  # padding
    buf.write(b"\x00")  # has_children = false
    buf.write(write_wz_int(width))
    buf.write(write_wz_int(height))
    buf.write(write_wz_int(1))  # format: 1 = BGRA4444
    buf.write(write_wz_int(0))  # format2: 0
    buf.write(struct.pack("<i", 0))  # unknown
    buf.write(struct.pack("<i", len(compressed_icon) + 1))  # data size + 1 for header byte
    buf.write(b"\x00")  # zlib header byte
    buf.write(compressed_icon)

    # ── Entry: "iconRaw" Canvas ──
    rw = icon_raw_w or width
    rh = icon_raw_h or height
    rd = icon_raw_data or pixel_data
    compressed_raw = zlib.compress(rd)

    buf.write(b"\x73")
    buf.write(write_wz_ascii_string("iconRaw"))
    buf.write(b"\x01")  # Canvas type

    buf.write(struct.pack("<H", 0))  # padding
    buf.write(b"\x00")  # has_children = false
    buf.write(write_wz_int(rw))
    buf.write(write_wz_int(rh))
    buf.write(write_wz_int(1))  # BGRA4444
    buf.write(write_wz_int(0))
    buf.write(struct.pack("<i", 0))
    buf.write(struct.pack("<i", len(compressed_raw) + 1))
    buf.write(b"\x00")
    buf.write(compressed_raw)

    # Patch the info sub-property size
    info_end = buf.tell()
    info_size = info_end - info_start
    buf.seek(info_start - 4)
    buf.write(struct.pack("<i", info_size))
    buf.seek(info_end)

    return buf.getvalue()


# ── WZ File Patcher ──

class WzFile:
    """Minimal WZ file reader/writer for patching in new entries."""

    def __init__(self, path):
        self.path = path
        self.data = open(path, "rb").read()
        self._parse_header()

    def _parse_header(self):
        f = BytesIO(self.data)
        magic = f.read(4)
        if magic != WZ_MAGIC:
            raise ValueError(f"Not a WZ file: {self.path}")
        self.file_size = struct.unpack("<Q", f.read(8))[0]
        self.data_start = struct.unpack("<I", f.read(4))[0]
        # Read description (null-terminated)
        desc = b""
        while True:
            b = f.read(1)
            if b == b"\x00":
                break
            desc += b
        self.description = desc.decode("ascii", errors="replace")
        self.header_size = f.tell()

    def get_info(self):
        return {
            "path": self.path,
            "size": len(self.data),
            "data_start": self.data_start,
            "description": self.description,
        }


def patch_string_wz(wz_path, items, output_path):
    """
    Patch String.wz to add custom item names.

    This is a simplified approach: we find the Eqp.img section and
    append new entries before its closing marker.

    For a production patcher, this would need full WZ parsing.
    For now, we use a pragmatic approach: rebuild String.wz from
    the server XML data + custom items.
    """
    # For String.wz, the simplest approach is to note that the string data
    # is relatively simple. We'll just copy the original and note that
    # the server-side String.wz XML already has the custom names (added by Phase 1).
    # The client String.wz needs the same additions.
    #
    # Since binary WZ modification is complex, we'll flag this for manual
    # handling with HaRepacker or note it as a known limitation.

    import shutil
    shutil.copy2(wz_path, output_path)
    print(f"  [String.wz] Copied original (names come from server-side XML override)")
    print(f"  [String.wz] For custom names in client, use HaRepacker to add entries")
    return True


def patch_character_wz(wz_path, items, output_path):
    """
    Patch Character.wz to add custom item icons.

    Strategy: Append new .img entries to the WZ file. This requires:
    1. Reading the directory structure
    2. Adding new entries to the appropriate subdirectory
    3. Writing the new .img data
    4. Updating the directory and file header

    Due to the complexity of the WZ format (encrypted strings, offset encoding),
    we use a simpler append-and-rebuild approach for the directory.
    """
    import shutil

    if not items:
        print("  [Character.wz] No items with icons to patch")
        shutil.copy2(wz_path, output_path)
        return True

    # For each item, generate the .img blob
    img_blobs = {}
    for item in items:
        icon_source = item.get("icon_url") or item.get("icon_path")
        if not icon_source:
            print(f"  [Character.wz] Skipping {item['item_id']} — no icon")
            continue

        try:
            w, h, pixels = png_to_bgra4444(icon_source)
            blob = build_img_blob(w, h, pixels)
            padded_id = str(item["item_id"]).zfill(8)
            img_blobs[padded_id] = blob
            print(f"  [Character.wz] Built .img for {padded_id} ({w}x{h}, {len(blob)} bytes)")
        except Exception as e:
            print(f"  [Character.wz] ERROR building {item['item_id']}: {e}")

    if not img_blobs:
        shutil.copy2(wz_path, output_path)
        return True

    # Write the .img blobs as standalone files that can be imported with HaRepacker
    # AND create a ready-to-import directory structure
    img_dir = Path(output_path).parent / "character_wz_patch"
    ring_dir = img_dir / "Ring"
    ring_dir.mkdir(parents=True, exist_ok=True)

    for padded_id, blob in img_blobs.items():
        blob_path = ring_dir / f"{padded_id}.img"
        with open(blob_path, "wb") as f:
            f.write(blob)
        print(f"  [Character.wz] Wrote {blob_path}")

    # Copy original for now — full binary patching is complex
    shutil.copy2(wz_path, output_path)

    print(f"\n  [Character.wz] Generated {len(img_blobs)} .img blobs in {img_dir}/")
    print(f"  [Character.wz] To apply: open Character.wz in HaRepacker, import .img files into Ring/")
    print(f"  [Character.wz] Then save and upload the modified Character.wz to R2")

    return True


# ── Main ──

def load_manifest(path):
    """Load custom items manifest from JSON file."""
    with open(path) as f:
        data = json.load(f)
    # Support both array and {items: [...]} format
    if isinstance(data, list):
        return data
    return data.get("items", [])


def main():
    parser = argparse.ArgumentParser(description="AugurMS WZ Patcher — inject custom items into client WZ files")
    parser.add_argument("--manifest", required=True, help="Path to custom_items.json manifest")
    parser.add_argument("--wz-dir", required=True, help="Directory containing client .wz files")
    parser.add_argument("--output", default="./patched", help="Output directory for patched files")
    parser.add_argument("--icons-dir", help="Local directory with icon PNGs (overrides icon_url)")
    args = parser.parse_args()

    items = load_manifest(args.manifest)
    if not items:
        print("No custom items found in manifest.")
        return

    print(f"Loaded {len(items)} custom items from manifest")

    # Override icon sources with local files if provided
    if args.icons_dir:
        for item in items:
            local_icon = Path(args.icons_dir) / f"{item['item_id']}-icon.png"
            if local_icon.exists():
                item["icon_path"] = str(local_icon)
                print(f"  Using local icon: {local_icon}")

    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)

    wz_dir = Path(args.wz_dir)

    # Filter to equip items with icons
    equip_items = [i for i in items if i.get("category") == "equip" and (i.get("icon_url") or i.get("icon_path"))]

    print(f"\n--- Patching Character.wz ({len(equip_items)} items with icons) ---")
    char_wz = wz_dir / "Character.wz"
    if char_wz.exists():
        patch_character_wz(str(char_wz), equip_items, str(output / "Character.wz"))
    else:
        print(f"  WARNING: {char_wz} not found")

    print(f"\n--- Patching String.wz ---")
    str_wz = wz_dir / "String.wz"
    if str_wz.exists():
        patch_string_wz(str(str_wz), items, str(output / "String.wz"))
    else:
        print(f"  WARNING: {str_wz} not found")

    # Generate icon PNGs for HaRepacker import
    icons_out = output / "icons"
    icons_out.mkdir(exist_ok=True)
    for item in equip_items:
        src = item.get("icon_path") or item.get("icon_url")
        if src:
            try:
                if src.startswith("http"):
                    data = urlopen(src).read()
                    dst = icons_out / f"{item['item_id']}-icon.png"
                    with open(dst, "wb") as f:
                        f.write(data)
                else:
                    import shutil
                    shutil.copy2(src, icons_out / f"{item['item_id']}-icon.png")
                print(f"  Saved icon: {item['item_id']}-icon.png")
            except Exception as e:
                print(f"  ERROR downloading icon for {item['item_id']}: {e}")

    print(f"\n=== Done ===")
    print(f"Output: {output}/")
    print(f"  character_wz_patch/Ring/  — .img blobs for HaRepacker import")
    print(f"  icons/                    — original PNG icons")
    print(f"  Character.wz              — original (patch with HaRepacker)")
    print(f"  String.wz                 — original (names from server XML)")
    print(f"\nNext steps:")
    print(f"  1. Open Character.wz in HaRepacker")
    print(f"  2. Navigate to Ring/")
    print(f"  3. Import each .img file from character_wz_patch/Ring/")
    print(f"  4. Save Character.wz")
    print(f"  5. Run: tools/publish_client.sh {output}")


if __name__ == "__main__":
    main()
