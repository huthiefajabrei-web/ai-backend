from firebase_functions import https_fn
from app import app as fastapi_app
from a2wsgi import ASGIMiddleware
from werkzeug.test import run_wsgi_app

wsgi_app = ASGIMiddleware(fastapi_app)

@https_fn.on_request()
def api(req: https_fn.Request) -> https_fn.Response:
    app_iter, status, headers = run_wsgi_app(wsgi_app, req.environ)
    return https_fn.Response(app_iter, status=status, headers=headers)

print("Wrapped successfully!")
