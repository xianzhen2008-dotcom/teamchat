#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ICONS = ROOT / "public" / "icons"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"

PWA_SIZES = {
    "teamchat-192.png": 192,
    "teamchat-512.png": 512,
    "teamchat-maskable-512.png": 512,
}

ANDROID_LAUNCHER_SIZES = {
    "mipmap-mdpi": {"launcher": 48, "foreground": 108},
    "mipmap-hdpi": {"launcher": 72, "foreground": 162},
    "mipmap-xhdpi": {"launcher": 96, "foreground": 216},
    "mipmap-xxhdpi": {"launcher": 144, "foreground": 324},
    "mipmap-xxxhdpi": {"launcher": 192, "foreground": 432},
}

BACKGROUND = "#dff6ef"
STROKE = "#8de0c5"
ACCENT = "#34d399"
INK = "#0f172a"


def make_rounded_canvas(size: int, inner_ratio: float = 0.82, radius_ratio: float = 0.24) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), BACKGROUND)
    draw = ImageDraw.Draw(canvas)
    radius = int(size * radius_ratio)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=BACKGROUND, outline=STROKE, width=max(2, size // 96))
    return canvas


def draw_teamchat_mark(canvas: Image.Image, fit_ratio: float) -> Image.Image:
    size = canvas.size[0]
    draw = ImageDraw.Draw(canvas)
    box = int(size * fit_ratio)
    left = (size - box) // 2
    top = (size - box) // 2
    radius = int(box * 0.24)
    draw.rounded_rectangle((left, top, left + box, top + box), radius=radius, fill="#ffffff", outline=STROKE, width=max(2, size // 80))
    bubble = (left + int(box * 0.18), top + int(box * 0.22), left + int(box * 0.82), top + int(box * 0.58))
    draw.rounded_rectangle(bubble, radius=int(box * 0.14), fill=ACCENT)
    tail = [
        (left + int(box * 0.34), top + int(box * 0.58)),
        (left + int(box * 0.24), top + int(box * 0.72)),
        (left + int(box * 0.48), top + int(box * 0.58)),
    ]
    draw.polygon(tail, fill=ACCENT)
    try:
        font = ImageFont.truetype("Arial Bold.ttf", int(box * 0.30))
    except Exception:
        font = ImageFont.load_default()
    text = "TC"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_x = left + (box - (bbox[2] - bbox[0])) / 2
    text_y = top + int(box * 0.61)
    draw.text((text_x, text_y), text, fill=INK, font=font)
    return canvas


def save_pwa_icons() -> None:
    PUBLIC_ICONS.mkdir(parents=True, exist_ok=True)
    for filename, size in PWA_SIZES.items():
        fit_ratio = 0.84 if "maskable" not in filename else 0.72
        icon = draw_teamchat_mark(make_rounded_canvas(size), fit_ratio)
        icon.save(PUBLIC_ICONS / filename, format="PNG")


def save_android_icons() -> None:
    for folder, sizes in ANDROID_LAUNCHER_SIZES.items():
        target = ANDROID_RES / folder
        target.mkdir(parents=True, exist_ok=True)

        launcher = draw_teamchat_mark(make_rounded_canvas(sizes["launcher"]), 0.86)
        launcher.save(target / "ic_launcher.png", format="PNG")
        launcher.save(target / "ic_launcher_round.png", format="PNG")

        foreground = Image.new("RGBA", (sizes["foreground"], sizes["foreground"]), (0, 0, 0, 0))
        foreground = draw_teamchat_mark(foreground, 0.78)
        foreground.save(target / "ic_launcher_foreground.png", format="PNG")


def main() -> None:
    save_pwa_icons()
    save_android_icons()
    print("TeamChat app icons generated.")


if __name__ == "__main__":
    main()
