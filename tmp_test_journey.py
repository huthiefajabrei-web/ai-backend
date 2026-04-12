import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from main import process_video_journey, jobs
import time

job_id = "test_job_123"
jobs[job_id] = {}

print("Starting process_video_journey...")
process_video_journey(
    job_id=job_id,
    perspectives=["Photorealistic Exterior"],
    custom_prompt="test video",
    input_image_b64=None,
    mime_type="image/png",
    reference_images=None,
    aspect_ratio="16:9"
)

print(f"Job result: {jobs[job_id]}")
