from firebase_functions import https_fn, options
from werkzeug.wrappers import Response

# Lazy-load FastAPI so Firebase discovery stays under the 10s timeout.
_wsgi_app = None


def _get_wsgi_app():
    global _wsgi_app
    if _wsgi_app is None:
        from app import app as fastapi_app
        from a2wsgi import ASGIMiddleware

        _wsgi_app = ASGIMiddleware(fastapi_app)
    return _wsgi_app


@https_fn.on_request(
    region="us-central1",
    timeout_sec=540,
    memory=options.MemoryOption.GB_1,
)
def api(req: https_fn.Request) -> https_fn.Response:
    """
    Native WSGI wrapper for Firebase Functions.
    This eliminates the internal threaded Uvicorn server,
    saving RAM and removing network proxy latency.
    """
    resp = Response.from_app(_get_wsgi_app(), req.environ)

    return https_fn.Response(
        response=resp.response,
        status=resp.status_code,
        headers=dict(resp.headers),
    )
