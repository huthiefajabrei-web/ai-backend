import os
from google import genai
from PIL import Image
import requests
from io import BytesIO

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", ""))

url = "https://picsum.photos/200/300"
response = requests.get(url)
img = Image.open(BytesIO(response.content))

try:
    print("Testing Veo-3.1 with image in prompt as string?")
    # maybe kwargs?
    op = client.models.generate_videos(
        model='veo-3.1-generate-preview',
        prompt='Make a smooth cinematic video transitioning from this image',
        # is there an image or visual_prompt arg? 
    )
    print("Success:", op.name)
except Exception as e:
    print("Error:", e)
