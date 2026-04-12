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
    return jwt.encode(payload, sk, algorithm="HS256", headers=headers)

if ak and sk:
    token = generate_jwt(ak, sk)
    url = "https://api-singapore.klingai.com/v1/videos/text2video/task-id-placeholder"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    r = requests.get(url, headers=headers)
    print("Status:", r.status_code)
    print("Response:", r.text)
