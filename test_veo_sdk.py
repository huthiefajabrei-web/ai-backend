import os
import time
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    print("No GEMINI_API_KEY found in .env")
    exit(1)

client = genai.Client(api_key=API_KEY)

print("Starting video generation with Veo 3.1...")
try:
    operation = client.models.generate_videos(
        model='veo-3.1-generate-preview',
        prompt='A beautiful time lapse of a futuristic architectural villa being built from the ground up, photorealistic, 4k',
        config=types.GenerateVideosConfig(
            person_generation="ALLOW_ADULT"
        )
    )

    print(f"Operation started! Name: {operation.name}")
    print("Waiting for completion...")
    
    # Wait for completion
    while not operation.done:
        time.sleep(10)
        operation = client.operations.get(operation=operation)
        print(f"Status: {operation.status}...")

    if operation.error:
        print(f"Error: {operation.error}")
    else:
        video_metadata = operation.response.generated_videos[0]
        video_uri = video_metadata.video.uri
        print(f"✅ Success! Video URI: {video_uri}")
        
except Exception as e:
    print(f"Failed to generate video: {e}")
