from firebase_functions import https_fn, options
import threading
import time
from flask import Flask, request, Response

flask_app = Flask(__name__)
UVICORN_PORT = 8082
UVICORN_URL = f"http://127.0.0.1:{UVICORN_PORT}"
uvicorn_started = False
startup_lock = threading.Lock()

def start_uvicorn():
    import uvicorn
    from app import app as fastapi_app
    config = uvicorn.Config(fastapi_app, host="127.0.0.1", port=UVICORN_PORT, log_level="error")
    server = uvicorn.Server(config)
    server.run()

@flask_app.route("/", defaults={"dummy": ""}, methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
@flask_app.route("/<path:dummy>", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
def proxy(dummy):
    global uvicorn_started
    with startup_lock:
        if not uvicorn_started:
            threading.Thread(target=start_uvicorn, daemon=True).start()
            uvicorn_started = True
            import requests
            for _ in range(50):
                try:
                    if requests.get(f"{UVICORN_URL}/").status_code == 200:
                        break
                except Exception:
                    time.sleep(0.1)

    import requests
    headers = {k: v for k, v in request.headers if k.lower() != 'host'}
    
    path = request.path
    if path.startswith("/api/"):
        path = path[4:]
    elif path == "/api":
        path = "/"
    if request.query_string:
        path = path + "?" + request.query_string.decode("utf-8")
    proxy_url = UVICORN_URL + path

    try:
        resp = requests.request(
            method=request.method,
            url=proxy_url,
            headers=headers,
            data=request.get_data(),
            cookies=request.cookies,
            allow_redirects=False,
            stream=True
        )
        
        excluded_headers = ['content-encoding', 'content-length', 'transfer-encoding', 'connection']
        resp_headers = [(k, v) for k, v in resp.raw.headers.items() if k.lower() not in excluded_headers]
        
        return Response(resp.iter_content(chunk_size=1024), resp.status_code, resp_headers)
    except Exception as e:
        return Response(f"Proxy Error: {str(e)}", status=500)

@https_fn.on_request(
    region="us-central1",
    timeout_sec=300,
    memory=options.MemoryOption.GB_1
)
def api(req: https_fn.Request) -> https_fn.Response:
    with flask_app.request_context(req.environ):
        rv = flask_app.preprocess_request()
        if rv is None:
            rv = flask_app.dispatch_request()
        response = flask_app.make_response(rv)
        return response
