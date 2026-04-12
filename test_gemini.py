import requests
import json

API_KEY = "AIzaSyBghxhcchvjHHSvyR0LRF_LC7HEoOSYI2w"

# Using the literal nano-banana-pro-preview model name
URL = f"https://generativelanguage.googleapis.com/v1beta/models/nano-banana-pro-preview:generateContent?key={API_KEY}"
payload = {
    "contents": [
        {
            "parts": [
                {"text": "A beautiful modern architecture villa passing through golden hour"}
            ]
        }
    ]
}

print("-" * 20)
print("Testing Nano Banana (nano-banana-pro-preview)...")
r = requests.post(URL, json=payload)
print("HTTP Status:", r.status_code)

if r.status_code == 200:
    print("Success! Nano Banana key is working perfectly.")
    try:
        data = r.json()
        # The model seems to return a base64 encoded string in inlineData.data
        base64_img = data["candidates"][0]["content"]["parts"][0]["inlineData"]["data"]
        
        # Decode the base64 string
        import base64
        image_bytes = base64.b64decode(base64_img)
        
        # Save to file
        output_filename = "nano_banana_output.jpg"
        with open(output_filename, "wb") as f:
            f.write(image_bytes)
            
        print(f"Image has been successfully generated and saved to: {output_filename}")
    except Exception as e:
        print("Failed to save the image. Expected structure not found or base64 decode failed.", e)
else:
    print("Error:", r.text)
