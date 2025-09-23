#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
data_imgs.txt に列挙された画像 URL をダウンロードし、
dataset.zip（画像＋ captions.txt）を生成する汎用スクリプト。

使い方例:
    python3 build_dataset_zip.py -i data_imgs.txt -o dataset.zip -t myChara
"""

import os
import argparse
import zipfile
import requests
from pathlib import Path
from urllib.parse import urlparse
from typing import List

# ────────────────────────────────────────────────────────────────────
def read_urls(txt_path: Path) -> List[str]:
    """
    data_imgs.txt から URL 一覧を読み取る

    @param Path txt_path
    @return List[str]
    """
    with txt_path.open(encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip()]

# ────────────────────────────────────────────────────────────────────
def download_image(url: str, save_dir: Path) -> Path:
    """
    画像をダウンロードして save_dir に保存し、保存先 Path を返す

    @param str url
    @param Path save_dir
    @return Path
    @raises Exception 失敗した場合
    """
    response = requests.get(url, timeout=30)
    response.raise_for_status()

    # URL からファイル名を抽出。重複時は連番を付与
    name = os.path.basename(urlparse(url).path) or "image"
    image_path = save_dir / name
    base, ext = os.path.splitext(image_path.name)
    idx = 1
    while image_path.exists():
        image_path = save_dir / f"{base}_{idx}{ext}"
        idx += 1

    with image_path.open("wb") as f:
        f.write(response.content)

    print(f"✅ ダウンロード完了: {image_path.name}")
    return image_path

# ────────────────────────────────────────────────────────────────────
def build_zip(images: List[Path], captions: List[str], token: str, zip_path: Path):
    """
    画像と captions.txt をまとめて ZIP を作成

    @param List[Path] images
    @param List[str] captions
    @param str token 固有トークン（例: myChara）
    @param Path zip_path 出力 zip
    """
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        # 画像を追加
        for img in images:
            zf.write(img, img.name)
        # captions.txt を生成＆追加
        captions_lines = [f"{token} {captions[i]}\n" for i in range(len(images))]
        zf.writestr("captions.txt", "".join(captions_lines))
    print(f"\n📦 dataset.zip を作成しました: {zip_path.resolve()}")

# ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="URL 一覧から dataset.zip を生成")
    parser.add_argument("-i", "--input", default="data_imgs.txt",
                        help="画像 URL 一覧ファイル（デフォルト: data_imgs.txt）")
    parser.add_argument("-o", "--output", default="dataset.zip",
                        help="出力 zip ファイル名（デフォルト: dataset.zip）")
    parser.add_argument("-t", "--token", default="myChara",
                        help="LoRA 呼び出し用トークン（デフォルト: myChara）")
    args = parser.parse_args()

    txt_path = Path(args.input)
    urls = read_urls(txt_path)
    if not urls:
        raise ValueError("URL が見つかりませんでした。data_imgs.txt を確認してください。")

    tmp_dir = Path("tmp_imgs")
    tmp_dir.mkdir(exist_ok=True)

    downloaded: List[Path] = []
    for url in urls:
        try:
            downloaded.append(download_image(url, tmp_dir))
        except Exception as e:
            print(f"⚠️  ダウンロード失敗: {url} ({e})")

    if not downloaded:
        raise RuntimeError("有効な画像が 1 枚もダウンロードできませんでした。")

    build_zip(downloaded, urls, args.token, Path(args.output))

    # 後片付け（必要なら残しても OK）
    for img in downloaded:
        img.unlink()
    tmp_dir.rmdir()

if __name__ == "__main__":
    main()
