import requests
import os
from dotenv import load_dotenv

load_dotenv()
key = os.getenv("KLING_API_KEY", "AenETgMtCAnTDndpNyCdKTtHNE8KAFhC")

endpoints = [
    ("Kling Singapore", "https://api-singapore.klingai.com/v1/videos/text2video"),
    ("PiAPI", "https://api.piapi.ai/api/v1/task"),
    ("ModelsLab", "https://modelslab.com/api/v6/video/text2video"),
    ("AIMLAPI", "https://api.aimlapi.com/v1/videos/text2video"),
    ("Pollo AI", "https://api.pollo.ai/v1/videos/text2video")
]

for name, url in endpoints:
    headers = {
        "Authorization": f"Bearer {key}", 
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    payload = {
        "model_name": "kling-v1-1", 
        "prompt": "flying cat",
        "model": "kling"
    }
    try:
        r = requests.post(url, headers=headers, json=payload, timeout=10)
        print(f"{name}: {r.status_code} - {r.text[:300]}")
    except Exception as e:
        print(f"{name}: Failed with {type(e).__name__}")
