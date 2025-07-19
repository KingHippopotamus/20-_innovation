import os
import requests
import argparse
import zipfile

API_URL = "https://fal.ai/models/fal-ai/flux-pro/kontext/api"
API_KEY = os.getenv("FAL_API_KEY")


def convert_image(path: str) -> bytes:
    """Send an image to the API and return the processed image bytes."""
    with open(path, "rb") as f:
        files = {"image": f}
        headers = {}
        if API_KEY:
            headers["Authorization"] = f"Key {API_KEY}"
        response = requests.post(API_URL, files=files, headers=headers)
        response.raise_for_status()
        return response.content


def main():
    parser = argparse.ArgumentParser(description="画像の指を4本から5本に修正します")
    parser.add_argument("images", nargs="+", help="入力画像ファイル")
    parser.add_argument("-o", "--output", default="output", help="出力ディレクトリ")
    args = parser.parse_args()

    os.makedirs(args.output, exist_ok=True)
    result_paths = []

    for img in args.images:
        result_data = convert_image(img)
        basename = os.path.basename(img)
        out_path = os.path.join(args.output, basename)
        with open(out_path, "wb") as f:
            f.write(result_data)
        result_paths.append(out_path)
        print(f"保存しました: {out_path}")

    zip_path = os.path.join(args.output, "results.zip")
    with zipfile.ZipFile(zip_path, "w") as zf:
        for path in result_paths:
            zf.write(path, os.path.basename(path))
    print(f"ZIPファイルを作成しました: {zip_path}")


if __name__ == "__main__":
    main()
