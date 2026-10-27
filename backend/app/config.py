from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    jwt_secret: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    # Short-lived: a stolen access token stops working soon. Sessions continue through the
    # refresh token, kept in an httpOnly cookie that page scripts can't read.
    jwt_expire_minutes: int = 15
    refresh_token_days: int = 30
    # None: Secure cookies everywhere except APP_ENV=development (plain-http localhost).
    cookie_secure: bool | None = None
    # Failed sign-ins allowed per window, per email and per client address, before a 429.
    login_window_minutes: int = 15
    login_max_failures_per_email: int = 5
    login_max_failures_per_ip: int = 20
    cors_origins: str = "http://localhost:5173"
    # Safe default: anything not explicitly "development" is treated as production.
    app_env: str = "production"
    # Uploaded vehicle photos are stored here and served at /api/media.
    media_dir: Path = Path(__file__).resolve().parents[1] / "media"

    @property
    def secure_cookies(self) -> bool:
        return (
            self.cookie_secure if self.cookie_secure is not None else self.app_env != "development"
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # values come from the environment / .env
