import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

try:
    print("Testing Veo simple text-to-video...")
    operation = client.models.generate_videos(
        model='veo-2.0-generate-001',
        prompt='A simple 3D render of a futuristic building, cinematic camera pan',
    )
    print("Operation started:", operation.name)
except Exception as e:
    print("Error:", e)
