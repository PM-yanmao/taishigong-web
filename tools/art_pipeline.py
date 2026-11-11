#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""《太史公》美术资产管线（开发期工具，运行时项目仍零依赖）

用途：作者把 ChatGPT 等生成的场景插画/立绘丢进目录后，跑一两条命令就能用。

    python tools/art_pipeline.py --scan --optimize

固定执行顺序（同时给多个参数时也按这个顺序，保证清单晚于 WebP 生成）：
    占位立绘 → 归一化 → WebP 化 → 扫描生成清单 → 报告

参数：
    --scan                扫描 assets/scene/，校验命名/尺寸/格式，生成 js/data/scene-art.js
    --normalize           非 16:9 场景图中心裁切并缩放到 1920×1080；角色图归一化到 800×800
    --optimize            把 assets/ 下所有 jpg 转成 assets/webp/<同相对路径>.webp（保留原图）
    --placeholder-yangyun 生成临时占位立绘 assets/char/char_yangyun.jpg（已有文件时默认跳过）
    --report              报告场景图齐缺、清单状态与 JPG/WebP 体积
    --all                 依次执行上述全部步骤（占位立绘不会覆盖已有真立绘）
    --force               配合 --placeholder-yangyun 覆盖已有文件

依赖：Pillow（仅开发期装；浏览器运行时与 npm test 都不需要 Python）。
路径：一律相对项目根（本文件所在目录的上一级），可在任意目录调用。
"""

from __future__ import annotations

import argparse
import io
import json
import random
import re
import sys
from pathlib import Path

from PIL import Image, ImageCms, ImageDraw, ImageFilter, ImageFont

# ----------------------------------------------------------------------------
# 路径与常量
# ----------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent

ASSETS = ROOT / "assets"
SCENE_DIR = ASSETS / "scene"
CHAR_DIR = ASSETS / "char"
WEBP_DIR = ASSETS / "webp"

SCENE_MANIFEST = ROOT / "js" / "data" / "scene-art.js"
SCENE_DATA_FILES = ("js/data/scenes.p1.js", "js/data/scenes.p2.js")

SCENE_W, SCENE_H = 1920, 1080
CHAR_SIZE = 800
JPEG_QUALITY = 90
WEBP_QUALITY = 82
WEBP_METHOD = 6

SCENE_EXTS = (".jpg", ".jpeg", ".png")
JPEG_EXTS = (".jpg", ".jpeg")

# 剧本解析失败时的兜底：与 js/data/scenes*.js 的 22 个节点 id 一致
FALLBACK_SCENE_IDS = (
    "P1", "P2", "P3", "P4", "P5", "P6",
    "L1", "L2A", "L2B", "L2C", "L3",
    "A1", "A2", "A3",
    "H1", "H2", "B1", "B2", "C1", "C2",
    "D1", "R1",
)

YANGYUN_JPG = CHAR_DIR / "char_yangyun.jpg"


# ----------------------------------------------------------------------------
# 小工具
# ----------------------------------------------------------------------------

def setup_stdout() -> None:
    """Windows 控制台/管道默认可能不是 UTF-8，统一成 UTF-8 免得中文输出乱码。"""
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # pragma: no cover - 老 Python 或特殊 stdout
        pass


def rel(path: Path) -> str:
    """项目根相对路径，统一用 /（写进清单与前端）。"""
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:  # 项目外的路径（理论上不会出现）
        return path.as_posix()


def human(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n / 1024:.1f} KB"
    return f"{n / (1024 * 1024):.2f} MB"


def title(text: str) -> None:
    print()
    print("=" * 62)
    print(f" {text}")
    print("=" * 62)


def warn(text: str) -> None:
    print(f"  [警告] {text}")


def ok(text: str) -> None:
    print(f"  [完成] {text}")


def info(text: str) -> None:
    print(f"         {text}")


# ----------------------------------------------------------------------------
# 场景 id：从剧本数据里解析，保证与 SCENES 同步
# ----------------------------------------------------------------------------

_ART_RE = re.compile(r"art:\s*'assets/scene/([A-Za-z0-9_]+)\.(?:jpg|jpeg|png)'")


def discover_scene_ids() -> list[str]:
    """按剧本节点顺序读出 22 个场景 id（regex 只认 art 字段，不执行业务代码）。"""
    ids: list[str] = []
    parsed_any = False
    for relpath in SCENE_DATA_FILES:
        file = ROOT / relpath
        if not file.exists():
            continue
        parsed_any = True
        text = file.read_text(encoding="utf-8")
        for match in _ART_RE.finditer(text):
            node_id = match.group(1)
            if node_id not in ids:
                ids.append(node_id)
    if not ids:
        if parsed_any:
            warn("剧本文件里没有解析到 art: 'assets/scene/<id>.jpg'，改用内置 22 个 id")
        else:
            warn("找不到剧本文件 js/data/scenes*.js，改用内置 22 个 id")
        ids = list(FALLBACK_SCENE_IDS)
    return ids


def find_scene_file(scene_id: str) -> Path | None:
    """在 assets/scene/ 里找 <id>.jpg/.jpeg/.png（Windows 上大小写不敏感，仍显式兼容）。"""
    for ext in SCENE_EXTS:
        candidate = SCENE_DIR / (scene_id + ext)
        if candidate.exists():
            return candidate
    if SCENE_DIR.is_dir():
        for file in SCENE_DIR.iterdir():
            if file.suffix.lower() in SCENE_EXTS and file.stem.lower() == scene_id.lower():
                return file
    return None


# ----------------------------------------------------------------------------
# 图片通用处理
# ----------------------------------------------------------------------------

def to_srgb(im: Image.Image) -> Image.Image:
    """统一到 sRGB；带 ICC 的尽量用 ImageCms 转换，失败退回普通 RGB。"""
    icc = im.info.get("icc_profile")
    if icc:
        try:
            src_profile = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            dst_profile = ImageCms.createProfile("sRGB")
            return ImageCms.profileToProfile(im, src_profile, dst_profile, outputMode="RGB")
        except Exception:
            pass
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        rgba = im.convert("RGBA")
        bg = Image.new("RGB", rgba.size, (245, 241, 232))
        bg.paste(rgba, mask=rgba.split()[-1])
        return bg
    if im.mode != "RGB":
        return im.convert("RGB")
    return im


def center_crop_to_aspect(im: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """中心裁切到目标宽高比（不缩放）。"""
    target_ratio = target_w / target_h
    ratio = im.width / im.height
    if abs(ratio - target_ratio) < 1e-6:
        return im
    if ratio > target_ratio:  # 太宽：裁左右
        new_w = max(1, int(round(im.height * target_ratio)))
        left = (im.width - new_w) // 2
        return im.crop((left, 0, left + new_w, im.height))
    new_h = max(1, int(round(im.width / target_ratio)))  # 太高：裁上下
    top = (im.height - new_h) // 2
    return im.crop((0, top, im.width, top + new_h))


def normalize_image(src: Path, target_w: int, target_h: int, out: Path | None = None) -> str:
    """中心裁切到目标比例并缩放到目标尺寸，保存 JPEG q90（png 源默认转出 jpg）。"""
    with Image.open(src) as raw:
        im = to_srgb(raw)
        cropped = center_crop_to_aspect(im, target_w, target_h)
        resized = cropped.resize((target_w, target_h), Image.LANCZOS)

    # 输出文件名：jpg/jpeg 原地写；png 写同名 .jpg（不删原 png，清单优先取 jpg）
    dst = out or src
    fmt = "JPEG"
    if dst.suffix.lower() not in JPEG_EXTS:
        dst = dst.with_suffix(".jpg")
    elif dst.suffix.lower() == ".jpeg":
        fmt = "JPEG"
    resized.save(dst, fmt, quality=JPEG_QUALITY, optimize=True)
    return rel(dst)


def webp_target(src: Path) -> Path:
    """assets/bg/x.jpg → assets/webp/bg/x.webp（同相对路径）。"""
    return WEBP_DIR / src.relative_to(ASSETS).with_suffix(".webp")


def jpg_files_under_assets() -> list[Path]:
    files: list[Path] = []
    if not ASSETS.is_dir():
        return files
    for path in sorted(ASSETS.rglob("*")):
        # assets/webp 下只有 webp，这里保险起见跳过，避免把将来手工放的 jpg 再转一圈
        if WEBP_DIR in path.parents:
            continue
        if path.is_file() and path.suffix.lower() in JPEG_EXTS:
            files.append(path)
    return files


def webp_files_under_assets() -> list[Path]:
    if not WEBP_DIR.is_dir():
        return []
    return sorted(p for p in WEBP_DIR.rglob("*.webp") if p.is_file())


def total_size(files: list[Path]) -> int:
    return sum(p.stat().st_size for p in files if p.exists())


# ----------------------------------------------------------------------------
# 步骤：WebP 化
# ----------------------------------------------------------------------------

def step_optimize() -> None:
    title("WebP 化（保留原 jpg，新增 assets/webp/ 文件）")
    sources = jpg_files_under_assets()
    if not sources:
        warn("assets/ 下没有 jpg，跳过")
        return

    rows: list[tuple[str, int, int]] = []
    failed = 0
    for src in sources:
        dst = webp_target(src)
        dst.parent.mkdir(parents=True, exist_ok=True)
        try:
            with Image.open(src) as raw:
                im = to_srgb(raw) if raw.mode not in ("RGBA", "LA") else raw.convert("RGBA")
                im.save(
                    dst,
                    "WEBP",
                    quality=WEBP_QUALITY,
                    method=WEBP_METHOD,
                    strip=True,  # 去掉 exif/icc 等元数据；WebP 插件会忽略未知项
                )
        except Exception as exc:  # 单张失败不影响其余
            failed += 1
            warn(f"{rel(src)} 转 WebP 失败：{exc}")
            continue
        before, after = src.stat().st_size, dst.stat().st_size
        rows.append((rel(src), before, after))
        ratio = (1 - after / before) * 100 if before else 0.0
        print(f"  {rel(src):<44} {human(before):>9} → {human(after):>9}  ({ratio:5.1f}%↓)")

    if not rows:
        warn("没有成功转换的图片")
        return

    print()
    before_total = sum(r[1] for r in rows)
    after_total = sum(r[2] for r in rows)
    saved = before_total - after_total
    pct = saved / before_total * 100 if before_total else 0.0
    ok(f"共 {len(rows)} 张：{human(before_total)} → {human(after_total)}，"
       f"节省 {human(saved)}（{pct:.1f}%）")
    if failed:
        warn(f"{failed} 张转换失败，见上方日志")
    info("原 jpg 未改动；前端 <picture> 优先 webp，旧浏览器自动回退 jpg")


# ----------------------------------------------------------------------------
# 步骤：归一化
# ----------------------------------------------------------------------------

def step_normalize() -> None:
    title("归一化尺寸（场景 1920×1080，角色 800×800，中心裁切）")
    changed = 0

    if SCENE_DIR.is_dir():
        scene_ids = discover_scene_ids()
        for scene_id in scene_ids:
            src = find_scene_file(scene_id)
            if src is None:
                continue
            try:
                with Image.open(src) as raw:
                    exact = raw.size == (SCENE_W, SCENE_H)
                if exact:
                    info(f"{rel(src)} 已是 {SCENE_W}×{SCENE_H}，跳过")
                    continue
                out = normalize_image(src, SCENE_W, SCENE_H)
                changed += 1
                print(f"  {rel(src):<44} → {out}")
            except Exception as exc:
                warn(f"{rel(src)} 归一化失败：{exc}")
    else:
        info("assets/scene/ 尚不存在（作者还没丢场景图），跳过场景图归一化")

    if CHAR_DIR.is_dir():
        char_files = [
            p for p in sorted(CHAR_DIR.iterdir())
            if p.is_file() and p.suffix.lower() in SCENE_EXTS
        ]
        for src in char_files:
            try:
                with Image.open(src) as raw:
                    exact = raw.size == (CHAR_SIZE, CHAR_SIZE)
                if exact:
                    info(f"{rel(src)} 已是 {CHAR_SIZE}×{CHAR_SIZE}，跳过")
                    continue
                out = normalize_image(src, CHAR_SIZE, CHAR_SIZE)
                changed += 1
                print(f"  {rel(src):<44} → {out}")
            except Exception as exc:
                warn(f"{rel(src)} 归一化失败：{exc}")
    else:
        info("assets/char/ 不存在，跳过角色图归一化")

    if changed:
        ok(f"归一化 {changed} 张")
    else:
        ok("没有需要归一化的图片")


# ----------------------------------------------------------------------------
# 步骤：占位立绘
# ----------------------------------------------------------------------------

PAPER = (233, 224, 205)
INK = (63, 58, 52)
SEAL_RED = (165, 42, 34)

FONT_CANDIDATES = (
    "C:/Windows/Fonts/simkai.ttf",
    "C:/Windows/Fonts/STKAITI.TTF",
    "C:/Windows/Fonts/simsun.ttc",
    "C:/Windows/Fonts/simhei.ttf",
)


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for font_path in FONT_CANDIDATES:
        if Path(font_path).exists():
            try:
                return ImageFont.truetype(font_path, size)
            except Exception:
                continue
    warn("找不到楷体/宋体字体，中文可能显示为方块（不影响文件生成）")
    return ImageFont.load_default()


def make_paper_base(size: int) -> Image.Image:
    """宣纸底：暖纸色 + 细纤维 + 轻微旧渍，随机数固定种子保证可重复生成。"""
    rng = random.Random(20261111)
    base = Image.new("RGB", (size, size), PAPER)

    texture = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(texture)
    # 纸纤维：短横线与小点
    for _ in range(size * 9):
        x, y = rng.randrange(size), rng.randrange(size)
        length = rng.randrange(2, 26)
        shade = rng.randrange(4, 18)
        draw.line((x, y, min(size - 1, x + length), y), fill=shade, width=1)
    for _ in range(size * 5):
        x, y = rng.randrange(size), rng.randrange(size)
        shade = rng.randrange(6, 22)
        draw.point((x, y), fill=shade)
    texture = texture.filter(ImageFilter.GaussianBlur(0.6))
    base = Image.composite(
        Image.new("RGB", (size, size), (206, 194, 172)), base, texture
    )

    # 四角轻微压暗，像旧纸
    vignette = Image.new("L", (size, size), 0)
    vdraw = ImageDraw.Draw(vignette)
    for i in range(10):
        inset = i * size // 40
        vdraw.rectangle(
            (inset, inset, size - 1 - inset, size - 1 - inset),
            outline=int(3 + i * 1.6),
            width=max(1, size // 80),
        )
    vignette = vignette.filter(ImageFilter.GaussianBlur(size // 22))
    base = Image.composite(
        Image.new("RGB", (size, size), (196, 183, 160)), base, vignette
    )
    return base


def make_ink_wash(size: int) -> Image.Image:
    """淡墨晕染层（RGBA）：几团低透明度墨，羽化后叠在纸上。"""
    rng = random.Random(44)
    wash = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(wash)

    blobs = [
        (0.46, 0.34, 0.34, 30, 26),
        (0.58, 0.46, 0.30, 22, 18),
        (0.40, 0.58, 0.26, 18, 20),
        (0.52, 0.30, 0.22, 14, 24),
    ]
    for cx, cy, radius, alpha, gray in blobs:
        box = (
            int(cx * size - radius * size), int(cy * size - radius * size),
            int(cx * size + radius * size), int(cy * size + radius * size),
        )
        draw.ellipse(box, fill=(gray, gray - 2, gray - 4, alpha))
    # 几笔淡墨横向扫过
    for _ in range(5):
        y = rng.randrange(int(size * 0.24), int(size * 0.72))
        length = rng.randrange(int(size * 0.2), int(size * 0.5))
        x = rng.randrange(0, max(1, size - length))
        draw.line((x, y, x + length, y + rng.randrange(-18, 18)),
                  fill=(70, 66, 60, rng.randrange(10, 22)),
                  width=rng.randrange(6, 16))
    return wash.filter(ImageFilter.GaussianBlur(size // 18))


def make_seal(size: int) -> Image.Image:
    """朱印：红底白字「太史」，略作旋转，像钤在纸角。"""
    seal_size = int(size * 0.155)
    pad = max(6, seal_size // 12)
    layer = Image.new("RGBA", (seal_size + pad * 2, seal_size + pad * 2), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    box = (pad, pad, pad + seal_size, pad + seal_size)
    draw.rounded_rectangle(box, radius=seal_size // 22, fill=SEAL_RED, width=1)
    # 印泥不匀：叠一点深浅与缺角
    rng = random.Random(9)
    for _ in range(90):
        x = rng.randrange(pad + 2, pad + seal_size - 2)
        y = rng.randrange(pad + 2, pad + seal_size - 2)
        draw.point((x, y), fill=(150, 36, 30, rng.randrange(40, 120)))
    inner = pad + max(4, seal_size // 20)
    draw.rectangle(
        (inner, inner, pad + seal_size - max(4, seal_size // 20), pad + seal_size - max(4, seal_size // 20)),
        outline=(246, 236, 220, 190),
        width=max(2, seal_size // 46),
    )

    font = load_font(int(seal_size * 0.38))
    cx = pad + seal_size // 2
    for index, char in enumerate(("太", "史")):
        bbox = draw.textbbox((0, 0), char, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        cy = pad + seal_size * (0.29 + index * 0.44)
        draw.text((cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1]), char,
                  font=font, fill=(248, 240, 226))
    return layer.rotate(-2.5, resample=Image.BICUBIC, expand=True)


def step_placeholder_yangyun(force: bool) -> None:
    title("生成杨恽占位立绘（800×800，宣纸底 + 淡墨 + 竖排「杨恽」+ 朱印）")
    if YANGYUN_JPG.exists() and not force:
        warn(f"{rel(YANGYUN_JPG)} 已存在，跳过（真立绘放好后不必再跑；确要覆盖加 --force）")
        return

    CHAR_DIR.mkdir(parents=True, exist_ok=True)
    size = CHAR_SIZE
    canvas = make_paper_base(size)
    canvas = Image.alpha_composite(canvas.convert("RGBA"), make_ink_wash(size))

    draw = ImageDraw.Draw(canvas)
    name_font = load_font(150)
    name = "杨恽"
    # 竖排：二字居中偏上，字距略松
    char_h = 150
    gap = 46
    total_h = char_h * 2 + gap
    start_y = (size - total_h) // 2 - 40
    for index, char in enumerate(name):
        bbox = draw.textbbox((0, 0), char, font=name_font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        x = (size - tw) / 2 - bbox[0]
        y = start_y + index * (char_h + gap) - bbox[1]
        # 淡墨重影：先偏移画一遍浅的，再画正字
        draw.text((x + 3, y + 3), char, font=name_font, fill=(*INK, 40))
        draw.text((x, y), char, font=name_font, fill=(*INK, 235))

    # 左侧小字：说明这是占位稿，免得误当真立绘
    small = load_font(30)
    small_text = "占位 · 待替换"
    bbox = draw.textbbox((0, 0), small_text, font=small)
    th = bbox[3] - bbox[1]
    for index, char in enumerate(small_text):
        y = int(size * 0.20) + index * (th + 14)
        draw.text((int(size * 0.145), y), char, font=small, fill=(110, 102, 92, 170))

    seal = make_seal(size)
    canvas.alpha_composite(seal, (size - seal.width - int(size * 0.055),
                                  size - seal.height - int(size * 0.05)))

    # 极轻的暗角，让画面更像一张旧纸
    shade = Image.new("L", (size, size), 0)
    sdraw = ImageDraw.Draw(shade)
    sdraw.ellipse((-size * 0.25, -size * 0.25, size * 1.25, size * 1.25), fill=255)
    shade = shade.filter(ImageFilter.GaussianBlur(size // 10))
    canvas = Image.composite(canvas, Image.new("RGBA", (size, size), (150, 138, 120, 255)), shade)

    canvas.convert("RGB").save(YANGYUN_JPG, "JPEG", quality=JPEG_QUALITY, optimize=True)
    ok(f"已生成 {rel(YANGYUN_JPG)}（{size}×{size}，{human(YANGYUN_JPG.stat().st_size)}）")
    info("以后用同名真立绘覆盖即可；前端按「有 webp 用 webp，否则 jpg」加载")


# ----------------------------------------------------------------------------
# 步骤：扫描 + 生成清单
# ----------------------------------------------------------------------------

def scene_files() -> dict[str, Path]:
    """assets/scene/ 下可识别的图片：{id: path}（大小写不敏感匹配 22 个 id）。"""
    found: dict[str, Path] = {}
    if not SCENE_DIR.is_dir():
        return found
    expected = {sid.lower(): sid for sid in discover_scene_ids()}
    for file in sorted(SCENE_DIR.iterdir()):
        if not file.is_file() or file.suffix.lower() not in SCENE_EXTS:
            continue
        sid = expected.get(file.stem.lower())
        if sid is None:
            warn(f"{rel(file)} 的文件名不对应任何剧本节点 id，已忽略（应命名为 P1.jpg 之类）")
            continue
        if file.stem != sid:
            warn(f"{rel(file)} 建议改名为 {sid}{file.suffix}（按节点 id 大写命名）")
        found.setdefault(sid, file)
    return found


def build_webp_map() -> dict[str, str]:
    """{原图相对路径: webp 相对路径}，只收「原图仍在」的配对，供 <picture> 使用。"""
    mapping: dict[str, str] = {}
    for webp in webp_files_under_assets():
        relative = webp.relative_to(WEBP_DIR)
        for ext in JPEG_EXTS:
            original = ASSETS / relative.with_suffix(ext)
            if original.exists():
                mapping[rel(original)] = rel(webp)
                break
        else:
            # png 原图（例如作者的场景 png）：也登记，前端回退到 png 同样成立
            original_png = ASSETS / relative.with_suffix(".png")
            if original_png.exists() and not (WEBP_DIR / relative.with_suffix(".png")).exists():
                mapping[rel(original_png)] = rel(webp)
    return dict(sorted(mapping.items()))


def write_manifest(ids_map: dict[str, dict[str, str]], webp_map: dict[str, str]) -> None:
    payload = {"version": 1, "ids": ids_map, "webp": webp_map}
    body = json.dumps(payload, ensure_ascii=False, indent=2)
    body = "\n".join(
        line if index == 0 else "  " + line
        for index, line in enumerate(body.splitlines())
    )
    content = (
        "/* ===== 美术资产清单 · 由 tools/art_pipeline.py --scan 生成，请勿手改 =====\n"
        " * 运行时零依赖，浏览器端经典脚本：挂载 globalThis.TSG_SCENE_ART；Node 可 require()。\n"
        " * ids  ：场景节点 id → 已就位的场景插画（只登记真实存在的文件；缺图时前端回退 assets/bg/）。\n"
        " * webp ：原图路径 → 已生成的 WebP（<picture> 优先加载 WebP，jpg 回退）。\n"
        " * 重新生成：python tools/art_pipeline.py --scan --optimize\n"
        " */\n"
        "(function (g) {\n"
        "  var ART = " + body + ";\n"
        "  g.TSG_SCENE_ART = ART;\n"
        "  if (typeof module !== 'undefined' && module.exports) module.exports = ART;\n"
        "})(typeof globalThis !== 'undefined' ? globalThis : this);\n"
    )
    SCENE_MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    SCENE_MANIFEST.write_text(content, encoding="utf-8")


def step_scan() -> None:
    title("扫描场景图并生成 js/data/scene-art.js")
    scene_ids = discover_scene_ids()
    found = scene_files()
    webp_map = build_webp_map()

    ids_map: dict[str, dict[str, str]] = {}
    missing: list[str] = []
    present = 0
    for scene_id in scene_ids:
        src = found.get(scene_id)
        if src is None:
            missing.append(scene_id)
            continue
        present += 1
        entry: dict[str, str] = {"jpg": rel(src)}
        webp = webp_target(src)
        if webp.exists():
            entry["webp"] = rel(webp)
            webp_map.setdefault(rel(src), rel(webp))
        ids_map[scene_id] = entry

        # 尺寸/格式校验（≥1920×1080 达标；不足标为可归一化放大）
        try:
            with Image.open(src) as raw:
                width, height = raw.size
                image_format = raw.format or "?"
        except Exception as exc:
            warn(f"{rel(src)} 无法读取（{exc}），请检查文件是否损坏")
            continue
        if (width, height) == (SCENE_W, SCENE_H):
            state = "标准"
        elif width >= SCENE_W and height >= SCENE_H:
            state = "可裁切归一化"
        else:
            state = "偏小，需放大归一化"
        webp_state = "webp 已生成" if webp.exists() else "webp 待生成（跑 --optimize）"
        print(f"  {scene_id:<4} {rel(src):<38} {width}×{height} {image_format:<4} {state} · {webp_state}")

    # 未匹配文件名也看看，给作者明确提示
    if SCENE_DIR.is_dir():
        for file in sorted(SCENE_DIR.iterdir()):
            if file.is_file() and file.suffix.lower() not in SCENE_EXTS:
                warn(f"{rel(file)} 扩展名不支持（只收 jpg/jpeg/png），已忽略")

    write_manifest(ids_map, webp_map)

    if present == 0:
        info("assets/scene/ 里还没有场景图——清单 ids 为空是正常的，前端会继续用 assets/bg/ 的共用背景")
    ok(f"清单已写入 {rel(SCENE_MANIFEST)}：场景图 {present}/{len(scene_ids)}，"
       f"WebP 映射 {len(webp_map)} 条")
    if missing:
        info("待作者补图：")
        print("    " + "  ".join(missing))


# ----------------------------------------------------------------------------
# 步骤：报告
# ----------------------------------------------------------------------------

def step_report() -> None:
    title("美术资产报告")
    scene_ids = discover_scene_ids()
    found = scene_files()
    webp_map = build_webp_map() if WEBP_DIR.is_dir() else {}

    missing = [sid for sid in scene_ids if sid not in found]
    ready = [sid for sid in scene_ids if sid in found]

    print(f"场景图：{len(ready)} / {len(scene_ids)} 已就位，{len(missing)} 张待补")
    print(f"  已齐：{'  '.join(ready) if ready else '（无）'}")
    print(f"  待补：{'  '.join(missing) if missing else '（无）'}")
    if SCENE_DIR.is_dir():
        scene_size = total_size([p for p in SCENE_DIR.iterdir() if p.is_file()])
        print(f"  assets/scene/ 合计：{human(scene_size)}")
    else:
        print("  assets/scene/ 目录尚不存在（作者丢图时新建同名目录即可）")

    jpgs = jpg_files_under_assets()
    webps = webp_files_under_assets()
    jpg_size = total_size(jpgs)
    webp_size = total_size(webps)
    pct = (1 - webp_size / jpg_size) * 100 if jpg_size and webp_size else 0.0
    print()
    print(f"assets/ 原图 jpg：{len(jpgs)} 张，{human(jpg_size)}")
    print(f"assets/webp/ ：{len(webps)} 张，{human(webp_size)}")
    if webps:
        print(f"WebP 体积对比：{human(jpg_size)} → {human(webp_size)}，节省 {pct:.1f}%")
        uncovered = [
            rel(p) for p in jpgs
            if rel(p) not in webp_map
        ]
        if uncovered:
            warn(f"{len(uncovered)} 张 jpg 还没有 WebP：{', '.join(uncovered[:6])}"
                 f"{' 等' if len(uncovered) > 6 else ''}（跑 --optimize）")
    else:
        print("  还没有 WebP（跑 --optimize）")

    manifest_state = "缺失"
    if SCENE_MANIFEST.exists():
        try:
            text = SCENE_MANIFEST.read_text(encoding="utf-8")
            match = re.search(r"var ART\s*=\s*(\{.*?\});", text, re.S)
            data = json.loads(match.group(1)) if match else {}
            manifest_state = (
                f"ids {len(data.get('ids', {}))} 条 / webp {len(data.get('webp', {}))} 条"
            )
        except Exception:
            manifest_state = "存在但解析失败"
    print()
    print(f"清单 js/data/scene-art.js：{manifest_state}")
    print("命令：python tools/art_pipeline.py --scan --optimize --report")


# ----------------------------------------------------------------------------
# main
# ----------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="art_pipeline.py",
        description="《太史公》美术资产管线（开发期工具；同时给多个参数按固定顺序执行）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "示例：\n"
            "  python tools/art_pipeline.py --scan --optimize\n"
            "  python tools/art_pipeline.py --all\n"
            "  python tools/art_pipeline.py --report\n"
        ),
    )
    parser.add_argument("--scan", action="store_true",
                        help="扫描 assets/scene/ 校验命名/尺寸/格式并生成 js/data/scene-art.js")
    parser.add_argument("--normalize", action="store_true",
                        help="场景图归一化 1920×1080，角色图 800×800（中心裁切）")
    parser.add_argument("--optimize", action="store_true",
                        help="assets/ 下 jpg 转 WebP 到 assets/webp/（保留原图）")
    parser.add_argument("--placeholder-yangyun", action="store_true", dest="placeholder",
                        help="生成杨恽占位立绘 assets/char/char_yangyun.jpg")
    parser.add_argument("--report", action="store_true",
                        help="报告场景图齐缺、清单状态与体积")
    parser.add_argument("--all", action="store_true",
                        help="依次执行 placeholder/normalize/optimize/scan/report")
    parser.add_argument("--force", action="store_true",
                        help="配合 --placeholder-yangyun 覆盖已有文件")
    return parser


def main(argv: list[str] | None = None) -> int:
    setup_stdout()
    args = build_parser().parse_args(argv)

    if args.all:
        args.placeholder = args.normalize = args.optimize = args.scan = args.report = True

    if not (args.placeholder or args.normalize or args.optimize or args.scan or args.report):
        build_parser().print_help()
        return 0

    # 固定顺序：先落文件，再算清单，最后报告
    if args.placeholder:
        step_placeholder_yangyun(force=args.force)
    if args.normalize:
        step_normalize()
    if args.optimize:
        step_optimize()
    if args.scan:
        step_scan()
    if args.report:
        step_report()

    print()
    print("管线结束。浏览器端保持不变：经典 <script>，零构建、零运行时依赖。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
