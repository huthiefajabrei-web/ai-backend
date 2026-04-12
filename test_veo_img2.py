import os
from google import genai
from PIL import Image
import requests
from io import BytesIO

url = "https://picsum.photos/200/300"
response = requests.get(url)
img = Image.open(BytesIO(response.content))

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", ""))

try:
    print("Testing Veo with image in prompt...")
    op = client.models.generate_videos(
        model='veo-2.0-generate-001',
        prompt=['Make a smooth cinematic video transitioning from this image', img],
    )
    print("Success:", op.name)
except Exception as e:
    print("Error:", e)
