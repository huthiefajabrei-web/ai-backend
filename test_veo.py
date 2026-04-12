import os
import requests
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    print("No GEMINI_API_KEY found in .env")
    exit(1)

print("1. Checking available models for this API key...")
url = f"https://generativelanguage.googleapis.com/v1beta/models?key={API_KEY}"
response = requests.get(url)

if response.status_code == 200:
    data = response.json()
    models = data.get("models", [])
    veo_models = [m["name"] for m in models if "veo" in m["name"].lower()]
    
    if veo_models:
        print("✅ SUCCESS: Found Veo models accessible with this key!")
        for m in veo_models:
            print(f"  - {m}")
    else:
        print("❌ NO VEO MODELS FOUND. Your key does not currently have access to Veo models.")
        print("Available models include:")
        for m in models[:5]:
            print(f"  - {m['name']}")
        print("  ... and others.")
else:
    print(f"Failed to fetch models. Status code: {response.status_code}")
    print(response.text)
