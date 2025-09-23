#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fal.ai flux‑pro/kontext で指を 5 本に修正するスクリプト（base64 対応版）
"""

import os
import argparse
import requests
import base64
from urllib.parse import urlparse
from typing import List, Optional, Dict, Any

API_URL: str = "https://fal.run/fal-ai/flux-pro/kontext"
API_KEY: Optional[str] = os.getenv("FAL_API_KEY")


def save_base64_image(data_url: str, save_dir: str) -> str:
    """data URL をデコードして保存しファイルパスを返す"""
    header, b64data = data_url.split(",", 1)
    if "image/png" in header:
        ext = ".png"
    elif "image/jpeg" in header or "image/jpg" in header:
        ext = ".jpg"
    else:
        ext = ".img"
    filename = f"result_{hash(data_url) & 0xfffffff}{ext}"
    save_path = os.path.join(save_dir, filename)
    with open(save_path, "wb") as f:
        f.write(base64.b64decode(b64data))
    print(f"✅ 保存しました (base64): {save_path}")
    return save_path


def request_image_edit(
    prompt: str,
    image_url: str,
    guidance_scale: float = 8.0,
    strength: float = 0.7,
    safety_tolerance: str = "6",  # 1〜6
) -> Dict[str, Any]:
    """Fal.ai へリクエストし JSON を返す"""
    headers = {"Content-Type": "application/json"}
    if API_KEY:
        headers["Authorization"] = f"Key {API_KEY}"

    payload = {
        "prompt": (
            "create a new image based on the original"
            # "Fix both hands so that each hand clearly shows five distinct fingers "
            # "with correct anatomy and proportions. Keep the rest of the image unchanged."
        ),
        "negative_prompt": (
            "extra finger, six fingers, deformed hand, blurry, nsfw"
        ),
        "image_url": image_url,
        "output_format": "png",
        "guidance_scale": 9,        # 7〜10 推奨
        "strength": 0.45,           # 0.35〜0.55 で調整
        "sync_mode": True,
        "safety_tolerance": "6",    # 最も緩いフィルタ
        "num_images": 3,            # 複数生成 → ベスト採用
        "mask_prompt": "hand, finger",
        "mask_type": "replace",
    }

    print(f"🔧 画像リクエスト: {image_url}")
    resp = requests.post(API_URL, json=payload, headers=headers)
    try:
        resp.raise_for_status()
    except requests.HTTPError as e:
        print("=== Fal Error ===")
        print(resp.text)
        raise e
    return resp.json()


def download_image(image_url: str, save_dir: str) -> str:
    """URL 画像をダウンロードして保存"""
    r = requests.get(image_url)
    r.raise_for_status()
    filename = os.path.basename(urlparse(image_url).path)
    save_path = os.path.join(save_dir, filename)
    with open(save_path, "wb") as f:
        f.write(r.content)
    print(f"✅ 保存しました (url): {save_path}")
    return save_path


def main(argv: Optional[List[str]] = None):
    parser = argparse.ArgumentParser(description="Fal.ai で画像の指を 5 本に修正します")
    parser.add_argument("image_urls", nargs="+", help="処理対象画像の URL（複数可）")
    parser.add_argument("-p", "--prompt", required=True, help="編集プロンプト（英語推奨）")
    parser.add_argument("-o", "--output", default="output", help="出力先ディレクトリ")
    args = parser.parse_args(argv)

    os.makedirs(args.output, exist_ok=True)

    for url in args.image_urls:
        try:
            result = request_image_edit(args.prompt, url)
            img_info = result["images"][0]
            if img_info["url"].startswith("data:"):
                save_base64_image(img_info["url"], args.output)
            else:
                download_image(img_info["url"], args.output)
        except Exception as e:
            print(f"❌ エラー: {url} - {e}")


if __name__ == "__main__":
    main()
