import requests
import os
import json
from dotenv import load_dotenv

load_dotenv()
key = os.getenv("KLING_API_KEY", "")

tests = [
    {
        "name": "ModelsLab Base Payload",
        "url": "https://modelslab.com/api/v6/video/text2video",
        "headers": {"Content-Type": "application/json"},
        "json": {"key": key, "prompt": "flying cat", "model_id": "kling"}
    },
    {
        "name": "PiAPI x-api-key",
        "url": "https://api.piapi.ai/api/v1/task",
        "headers": {"x-api-key": key, "Content-Type": "application/json"},
        "json": {"model": "kling", "task_type": "video_generation", "input": {"prompt": "flying cat"}}
    },
    {
        "name": "Kling Official (direct Bearer)",
        "url": "https://api-singapore.klingai.com/v1/videos/text2video",
        "headers": {"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        "json": {"model_name": "kling-v1-1", "prompt": "flying cat"}
    },
    {
        "name": "API2D / OpenAI compatible",
        "url": "https://api.klingai.com/v1/videos/text2video",
        "headers": {"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        "json": {"model_name": "kling-v1-1", "prompt": "flying cat"}
    }
]

for t in tests:
    try:
        r = requests.post(t["url"], headers=t.get("headers", {}), json=t.get("json", {}), timeout=10)
        print(f"{t['name']}: {r.status_code}")
        print(r.text[:300])
        print("-" * 40)
    except Exception as e:
        print(f"{t['name']}: Failed - {e}\n" + "-"*40)
