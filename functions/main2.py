from firebase_functions import https_fn, options
from flask import Flask, request, Response

flask_app = Flask(__name__)

@flask_app.route("/", defaults={"dummy": ""}, methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
@flask_app.route("/<path:dummy>", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
def proxy(dummy):
    return {"path": request.path, "full_path": request.full_path, "dummy": dummy}

@https_fn.on_request(
    region="us-central1",
    timeout_sec=300,
    memory=options.MemoryOption.GB_1,
    cors=options.CorsOptions(cors_origins="*", cors_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
)
def api(req: https_fn.Request) -> https_fn.Response:
    with flask_app.request_context(req.environ):
        rv = flask_app.preprocess_request()
        if rv is None:
            rv = flask_app.dispatch_request()
        response = flask_app.make_response(rv)
        return response
