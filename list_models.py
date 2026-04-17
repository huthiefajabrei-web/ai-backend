import requests

API_KEY = ""
url = f"https://generativelanguage.googleapis.com/v1beta/models?key={API_KEY}"
r = requests.get(url)

try:
    models = r.json().get('models', [])
    for m in models:
        print(f"Name: {m['name']}")
        print(f"Supported methods: {m.get('supportedGenerationMethods', [])}")
        print("-" * 20)
except Exception as e:
    print(r.text)
