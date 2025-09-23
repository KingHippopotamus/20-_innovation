#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Kontext 汎用スクリプト
  * 入力: URL, ローカル画像パス, data:image/... base64
  * 出力: URL 画像 or dataURL を自動保存
  * fal_client v0.7+ (クラス不要)
"""

import os
import argparse
import base64
import mimetypes
import requests
from urllib.parse import urlparse
from typing import List, Optional, Dict, Any

import fal_client

# Fal 認証（FAL_KEY を export しておくか、ここに直接代入）
fal_client.api_key = os.getenv("FAL_KEY")

ENDPOINT = "fal-ai/flux-pro/kontext"

DEFAULT_PROMPT = (
    "make the character hold a donut"
    "Fix both hands so that each hand clearly shows five distinct fingers "
    "with correct anatomy and proportions. Keep the rest of the image unchanged."
)
NEG_PROMPT = "extra finger, six fingers, deformed hand, blurry, nsfw"

# ────────────────────────────────────────────────
def encode_file(path: str) -> str:
    mime, _ = mimetypes.guess_type(path)
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    return f"data:{mime or 'application/octet-stream'};base64,{b64}"

def normalize(src: str) -> str:
    if src.startswith(("http://", "https://", "data:")):
        return src
    if os.path.isfile(src):
        return encode_file(src)
    raise FileNotFoundError(f"{src} は URL でもファイルでもありません")

def save_data_url(data_url: str, outdir: str) -> str:
    head, b64 = data_url.split(",", 1)
    ext = ".png" if "png" in head else ".jpg"
    path = os.path.join(outdir, f"result_{hash(data_url)&0xFFFFFFF}{ext}")
    with open(path, "wb") as f:
        f.write(base64.b64decode(b64))
    print("✅ 保存 (base64)", path)
    return path

def save_url(img_url: str, outdir: str) -> str:
    r = requests.get(img_url); r.raise_for_status()
    name = os.path.basename(urlparse(img_url).path)
    path = os.path.join(outdir, name)
    with open(path, "wb") as f: f.write(r.content)
    print("✅ 保存 (url)  ", path)
    return path
# ────────────────────────────────────────────────
def run_kontext(prompt: str, image_ref: str) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "prompt": prompt,
        "negative_prompt": NEG_PROMPT,
        "image_url": image_ref,
        "output_format": "png",
        "guidance_scale": 9,
        "strength": 0.45,
        "safety_tolerance": "6",
        "num_images": 1,
    }
    print("🔧 リクエスト:", image_ref[:60] + ("…" if len(image_ref) > 60 else ""))
    return fal_client.subscribe(ENDPOINT, arguments=payload)

# ────────────────────────────────────────────────
def main(argv: Optional[List[str]] = None):
    parser = argparse.ArgumentParser(description="Kontext 汎用編集ツール (fal_client)")
    parser.add_argument("images", nargs="+", help="URL / path / dataURL")
    parser.add_argument(
        "-p", "--prompt",
        default=DEFAULT_PROMPT,          # ← デフォルトを設定
        help="編集プロンプト（省略時は既定文）"
    )
    parser.add_argument("-o", "--output", default="output", help="保存ディレクトリ")
    args = parser.parse_args(argv)

    os.makedirs(args.output, exist_ok=True)

    for src in args.images:
        try:
            img_ref = normalize(src)
            result = run_kontext(args.prompt, img_ref)
            out_url = result["images"][0]["url"]
            if out_url.startswith("data:"):
                save_data_url(out_url, args.output)
            else:
                save_url(out_url, args.output)
        except Exception as e:
            print("❌ エラー:", src, "-", e)

if __name__ == "__main__":
    main()
