from firebase_functions import https_fn, options
from app import app as fastapi_app
from a2wsgi import ASGIMiddleware
from werkzeug.wrappers import Response

# Convert FastAPI ASGI app to WSGI
wsgi_app = ASGIMiddleware(fastapi_app)

@https_fn.on_request(
    region="us-central1",
    timeout_sec=540,
    memory=options.MemoryOption.GB_1
)
def api(req: https_fn.Request) -> https_fn.Response:
    """
    Native WSGI wrapper for Firebase Functions.
    This eliminates the internal threaded Uvicorn server,
    saving RAM and removing network proxy latency.
    """
    # Create a Werkzeug Response by running the WSGI app
    resp = Response.from_app(wsgi_app, req.environ)
    
    # Return a Firebase HTTPS Response, passing the iterable for streaming support
    return https_fn.Response(
        response=resp.response,
        status=resp.status_code,
        headers=dict(resp.headers)
    )
