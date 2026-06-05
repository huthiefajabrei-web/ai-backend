import urllib.request
import json

req = urllib.request.Request(
    "http://127.0.0.1:8000/subscribe",
    data=json.dumps({"plan_id": "p1"}).encode('utf-8'),
    headers={
        "Content-Type": "application/json",
        "Origin": "http://localhost:3000"
    }
)

try:
    print("Testing /subscribe endpoint with Origin...")
    with urllib.request.urlopen(req, timeout=5) as res:
        print("Status:", res.status)
        print("Response:", res.read().decode('utf-8'))
        print("Headers:\n", res.headers)
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code)
    print("Response:", e.read().decode('utf-8'))
    print("Headers:\n", e.headers)
except Exception as e:
    print("Error:", e)
