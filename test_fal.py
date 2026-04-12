import os
from dotenv import load_dotenv
load_dotenv()
import requests
import time

FAL_KEY = os.getenv("FAL_KEY", "").strip()

fal_headers = {
    "Authorization": f"Key {FAL_KEY}",
    "Content-Type": "application/json"
}

# Using Luma Dream Machine
fal_payload = {
    "prompt": "Cinematic camera pan, slow smooth motion, high quality render.",
    "aspect_ratio": "16:9"
}

print("Submitting to Fal.ai...")
submit_url = "https://queue.fal.run/fal-ai/luma-dream-machine"
try:
    submit_res = requests.post(submit_url, headers=fal_headers, json=fal_payload)
    print("Status:", submit_res.status_code)
    try:
        print("Response:", submit_res.json())
    except:
        print("Text Response:", submit_res.text)
except Exception as e:
    print("Error:", e)
