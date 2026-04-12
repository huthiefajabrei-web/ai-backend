import jwt
import time
import requests
import os
from dotenv import load_dotenv

load_dotenv()

ak = os.getenv("KLING_API_KEY", "")
sk = os.getenv("KLING_SECRET_KEY", "")

def generate_jwt(ak, sk):
    headers = {
        "alg": "HS256",
        "typ": "JWT"
    }
    payload = {
        "iss": ak,
        "exp": int(time.time()) + 1800,
        "nbf": int(time.time()) - 5
    }
    token = jwt.encode(payload, sk, algorithm="HS256", headers=headers)
    return token

if ak and sk:
    token = generate_jwt(ak, sk)
    
    # Test Kling V2.6 model (same as main.py)
    model_name = os.getenv("KLING_VIDEO_MODEL", "kling-v2.6-pro")
    print(f"Testing '{model_name}' text2video...")
    url = "https://api-singapore.klingai.com/v1/videos/text2video"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    payload = {
        "model_name": model_name,
        "prompt": "Architectural visualization of a modern home, realistic, 4k"
    }
    r = requests.post(url, headers=headers, json=payload)
    print("Status:", r.status_code)
    print("Response:", r.text)

    print(f"\nTesting '{model_name}' image2video...")
    url_i2v = "https://api-singapore.klingai.com/v1/videos/image2video"
    payload_i2v = {
        "model_name": model_name,
        "image": "https://www.w3schools.com/w3images/lights.jpg", # Placeholder image
        "prompt": "Animate the lights"
    }
    r2 = requests.post(url_i2v, headers=headers, json=payload_i2v)
    print("Status:", r2.status_code)
    print("Response:", r2.text)

else:
    print("KLING_API_KEY or KLING_SECRET_KEY missing from .env")
