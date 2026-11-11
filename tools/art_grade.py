#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""美术资产调色/归一化（开发期工具，Pillow + numpy）。

作者用 GPT 出的图往往比项目现有背景更暗、更暖、更"新"，直接入库会在
页面切换时跳色。这个脚本做两件事：

  1. 归一化：场景图中心裁切到 16:9 → 1920×1080；人物卡中心裁切 800×800。
  2. 调色（只动颜色，不动构图）：
     - 按 id 指定目标中间调，做 gamma 提亮/压暗（默认只对偏暗的图提亮）；
     - 轻微降饱和（向亮度混合，保留火盆/灯的暖色）；
     - 冷暗部 / 暖高光的分区调色，贴近现有 bg 的冷青灰 + 暖灯金；
     - 很轻的对比、S 曲线、暗角，以及高光滚降。
  3. 可选 --install：把结果写进 assets/scene/<id>.jpg 与 assets/char/。

用法（项目根运行）：
    python tools/art_grade.py                 # 只输出到 analysis/graded 预览
    python tools/art_grade.py --install       # 预览 + 写入项目 assets
    python tools/art_grade.py --src "D:/新图" --map tools/art-batch-map.json

映射文件 art-batch-map.json：
    [
      {"file": "ChatGPT ...png", "id": "L2A", "type": "scene", "target_p50": 0.22},
      {"file": "...", "id": "yangyun", "type": "char"},
      {"file": "...", "id": "L1", "skip": true}
    ]
"""
import argparse
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_MAP = os.path.join(ROOT, 'tools', 'art-batch-map.json')
DEFAULT_OUT = os.path.join(ROOT, 'analysis', 'graded')


def luma(rgb):
    return 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]


def smoothstep(x, a, b):
    t = np.clip((x - a) / max(b - a, 1e-6), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def grade_scene(im, target_p50=0.18, strength=1.0):
    """只调色：曝光、去饱和、冷暗部/暖高光、轻对比与暗角。"""
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255.0
    L = luma(a)
    p50 = float(np.percentile(L, 50))
    # 1) 以中间调为锚的 gamma 提亮/压暗（blend 避免过冲）
    if p50 > 1e-3 and target_p50 > 0:
        gamma = np.log(target_p50) / np.log(max(p50, 0.02))
        gamma = float(np.clip(gamma, 0.55, 1.8))
        gamma = 1.0 + (gamma - 1.0) * 0.75 * strength
        a = np.clip(a, 0, 1) ** gamma
    # 2) 轻微降饱和（保留高饱和暖色区域）
    L2 = luma(a)[:, :, None]
    a = L2 + (a - L2) * (1.0 - 0.20 * strength)
    # 3) 冷暗部 / 暖高光的分区调色
    L3 = luma(a)
    shadow = (1.0 - smoothstep(L3, 0.0, 0.42))[:, :, None]
    high = smoothstep(L3, 0.55, 1.0)[:, :, None]
    a = a + shadow * np.array([-0.010, -0.001, 0.020], np.float32) * strength
    a = a + high * np.array([0.014, 0.004, -0.010], np.float32) * strength
    # 4) 轻对比 + 高光滚降
    a = (a - 0.45) * (1.0 + 0.035 * strength) + 0.45
    a = 1.0 - np.power(np.clip(1.0 - a, 0, 1), 1.02)
    # 5) 很轻的暗角
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    r = np.sqrt(((xx - cx) / cx) ** 2 + ((yy - cy) / cy) ** 2)
    vig = 1.0 - np.clip((r - 0.55) / 0.95, 0, 1) ** 2 * 0.16 * strength
    a = a * vig[:, :, None]
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), 'RGB')


def grade_char(im, strength=1.0):
    """人物卡：宣纸暖白底 + 淡彩，向现有 6 张卡的纸色/亮度靠。"""
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255.0
    L = luma(a)
    p50 = float(np.percentile(L, 50))
    # 纸底提亮（现有卡 p50 约 0.85–0.90）
    if p50 > 1e-3:
        gamma = np.log(0.87) / np.log(max(p50, 0.02))
        gamma = float(np.clip(gamma, 0.6, 1.6))
        gamma = 1.0 + (gamma - 1.0) * 0.7 * strength
        a = np.clip(a, 0, 1) ** gamma
    # 纸色：现有卡 mean 约 (200,190,175)
    m = a.reshape(-1, 3).mean(axis=0)
    target = np.array([0.784, 0.745, 0.686], np.float32)  # 200,190,175 / 255
    if m.min() > 1e-3:
        gain = np.clip(target / m, 0.75, 1.35)
        a = np.clip(a * (1.0 + (gain - 1.0) * 0.65 * strength), 0, 1)
    # 轻微降饱和，保留墨色层次
    L2 = luma(a)[:, :, None]
    a = L2 + (a - L2) * (1.0 - 0.10 * strength)
    # 轻对比 + 纸面暖调
    a = (a - 0.5) * (1.0 + 0.03 * strength) + 0.5
    a = a + np.array([0.006, 0.002, -0.006], np.float32) * strength
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), 'RGB')


def normalize_scene(im):
    return ImageOps.fit(im.convert('RGB'), (1920, 1080), method=Image.LANCZOS, centering=(0.5, 0.5))


def normalize_char(im):
    return ImageOps.fit(im.convert('RGB'), (800, 800), method=Image.LANCZOS, centering=(0.5, 0.5))


def stat_line(label, im):
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255.0
    L = luma(a)
    p5, p50, p95 = np.percentile(L, [5, 50, 95])
    hsv = np.asarray(im.convert('HSV')).astype(np.float32)
    return ('%s  meanRGB=(%3.0f,%3.0f,%3.0f) S=%3.0f V=%3.0f  L p5/p50/p95=%.2f/%.2f/%.2f' % (
        label, a[:, :, 0].mean() * 255, a[:, :, 1].mean() * 255, a[:, :, 2].mean() * 255,
        hsv[:, :, 1].mean(), hsv[:, :, 2].mean(), p5, p50, p95))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=r'C:\Users\CuteGrass\Desktop\assest', help='作者出图的源目录')
    ap.add_argument('--map', default=DEFAULT_MAP, help='映射 json')
    ap.add_argument('--out', default=DEFAULT_OUT, help='预览输出目录')
    ap.add_argument('--install', action='store_true', help='把结果写入 assets/scene 与 assets/char')
    ap.add_argument('--strength', type=float, default=1.0, help='调色强度 0–1.5，默认 1')
    args = ap.parse_args()

    with open(args.map, encoding='utf-8') as f:
        mapping = json.load(f)
    os.makedirs(args.out, exist_ok=True)

    scene_dir = os.path.join(ROOT, 'assets', 'scene')
    char_dir = os.path.join(ROOT, 'assets', 'char')
    os.makedirs(scene_dir, exist_ok=True)
    os.makedirs(char_dir, exist_ok=True)

    for item in mapping:
        if item.get('skip'):
            print('跳过（已入库/已认可）:', item.get('file'))
            continue
        src = os.path.join(args.src, item['file'])
        if not os.path.exists(src):
            print('  [缺失]', src)
            continue
        im = Image.open(src)
        before = im.copy()
        if item.get('type') == 'char':
            out = grade_char(normalize_char(im), args.strength)
        else:
            out = grade_scene(normalize_scene(im), float(item.get('target_p50', 0.18)), args.strength)
        print('  ' + stat_line('before ' + str(item.get('id')), before))
        print('  ' + stat_line('after  ' + str(item.get('id')), out))
        if item.get('type') == 'char':
            name = 'char_%s.jpg' % item.get('id', 'unknown')
            dst_dir = char_dir
        else:
            name = '%s.jpg' % item.get('id', 'unknown')
            dst_dir = scene_dir
        preview = os.path.join(args.out, name)
        out.save(preview, 'JPEG', quality=92, optimize=True)
        if args.install:
            out.save(os.path.join(dst_dir, name), 'JPEG', quality=90, optimize=True)
            print('  -> 写入', os.path.join(dst_dir, name))
    print('\n预览目录:', args.out)
    if args.install:
        print('已写入项目 assets。接下来跑：python tools/art_pipeline.py --scan --optimize --report')


if __name__ == '__main__':
    sys.exit(main())
