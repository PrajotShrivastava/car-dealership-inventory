from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.errors import register_error_handlers
from app.media import MEDIA_URL_PREFIX, photo_folder
from app.routers import account, auth, dashboard, dealers, leads, sales, vehicles


def create_app() -> FastAPI:
    app = FastAPI(title="DriveStock API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_origin_list,
        # The refresh-token cookie is sent to /api/auth from the web app's origin.
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["Authorization", "Content-Type"],
    )
    register_error_handlers(app)
    app.include_router(auth.router, prefix="/api")
    app.include_router(vehicles.router, prefix="/api")
    app.include_router(dealers.router, prefix="/api")
    app.include_router(dashboard.router, prefix="/api")
    app.include_router(sales.router, prefix="/api")
    app.include_router(leads.router, prefix="/api")
    app.include_router(account.router, prefix="/api")
    # Served without sign-in because <img> tags can't send a bearer token. File names are
    # random 128-bit keys, so a photo can only be found through the (signed-in) vehicle API.
    photo_folder().mkdir(parents=True, exist_ok=True)
    app.mount(
        MEDIA_URL_PREFIX,
        StaticFiles(directory=get_settings().media_dir),
        name="media",
    )

    @app.get("/api/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
