import os, fal_client, json, base64, hashlib

fal_client.api_key = os.getenv("FAL_KEY")
ENDPOINT = "fal-ai/flux-lora-fast-training"
DATASET_URL = "https://your-bucket.s3.amazonaws.com/dataset.zip"
TOKEN = "myChara"
META_JSON = "lora_meta.json"

def dataset_hash(url: str) -> str:
    # URL の SHA256 (オプション)。ローカル zip の SHA256 でも可
    import requests, hashlib
    h = hashlib.sha256()
    with requests.get(url, stream=True) as r:
        for chunk in r.iter_content(8192):
            h.update(chunk)
    return h.hexdigest()

# 1) 既に保存済みか確認
if os.path.exists(META_JSON):
    meta = json.load(open(META_JSON))
    print("既存 LoRA URL:", meta["lora_url"])
    exit()

# 2) なければ学習
handle = fal_client.create_job(
    ENDPOINT,
    arguments={
        "images_data_url": DATASET_URL,
        "trigger_word": TOKEN,
        "dataset_hash": dataset_hash(DATASET_URL)  # ← メタデータに埋めておく
    }
)
print("Training... Job ID:", handle)
result = fal_client.poll_job(handle)   # 完了待ち
print("New LoRA URL:", result["lora_url"])

# 3) メタを保存
json.dump(
    {
        "request_id": handle,
        "lora_url": result["lora_url"]
    },
    open(META_JSON, "w")
)
