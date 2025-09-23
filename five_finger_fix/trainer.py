#!/usr/bin/env python3
import os, base64, fal_client

API_KEY = os.getenv("FAL_KEY") or os.getenv("FAL_API_KEY")
if API_KEY:
    fal_client.api_key = API_KEY          # ← ここを set_api_key ではなく代入に

with open("dataset.zip", "rb") as f:
    zip_b64 = base64.b64encode(f.read()).decode()

    dataset_url = "https://adbase-static-dev.s3.ap-northeast-1.amazonaws.com/img/dataset.zip"

    job = fal_client.subscribe(
        "fal-ai/flux-lora-fast-training",
        arguments={
            "images_data_url": dataset_url,   # ← data: ではなく https://
            "trigger_word": "myChara"
        }
    )
print("LoRA URL:", job["lora_url"])

print("LoRA URL:", job["lora_url"])
