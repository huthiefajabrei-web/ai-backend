import os
import requests
import json
import time
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")

def generate_video(prompt):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predict?key={API_KEY}"
    payload = {
        "instances": [
            {
                "prompt": {"text": prompt}
            }
        ],
        "parameters": {
            "sampleCount": 1
        }
    }
    
    response = requests.post(url, json=payload)
    print("STATUS", response.status_code)
    try:
        data = response.json()
        print(json.dumps(data, indent=2)[:500])
    except:
        print("TEXT:", response.text)

if __name__ == "__main__":
    generate_video("a simple test video of a ball bouncing")
