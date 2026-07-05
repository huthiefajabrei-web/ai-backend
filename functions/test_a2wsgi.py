import sys
from fastapi import FastAPI
from a2wsgi import ASGIMiddleware
from werkzeug.wrappers import Request, Response

fastapi_app = FastAPI()

@fastapi_app.get("/")
def read_root():
    return {"Hello": "World"}

wsgi_app = ASGIMiddleware(fastapi_app)

def api(environ, start_response):
    req = Request(environ)
    # Using Response.from_app
    resp = Response.from_app(wsgi_app, req.environ)
    return resp(environ, start_response)

if __name__ == "__main__":
    from werkzeug.test import EnvironBuilder
    builder = EnvironBuilder(method='GET', path='/')
    env = builder.get_environ()
    req = Request(env)
    
    resp = Response.from_app(wsgi_app, req.environ)
    print(resp.status)
    print(resp.get_data())
