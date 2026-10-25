"""Where uploaded vehicle photos live on disk and the URLs they are served from.

Files are named by a random key, never by the uploader's file name. Only this module
knows the layout, so moving to object storage later means changing it alone.
"""

import logging
from collections.abc import Iterable
from pathlib import Path

from app.config import get_settings

logger = logging.getLogger(__name__)

MEDIA_URL_PREFIX = "/api/media"
_PHOTO_FOLDER = "vehicles"


def photo_folder() -> Path:
    return Path(get_settings().media_dir) / _PHOTO_FOLDER


def _names(key: str) -> tuple[str, str]:
    return f"{key}.webp", f"{key}-thumb.webp"


def photo_url(key: str) -> str:
    return f"{MEDIA_URL_PREFIX}/{_PHOTO_FOLDER}/{_names(key)[0]}"


def thumb_url(key: str) -> str:
    return f"{MEDIA_URL_PREFIX}/{_PHOTO_FOLDER}/{_names(key)[1]}"


def save_photo(key: str, full: bytes, thumb: bytes) -> None:
    folder = photo_folder()
    folder.mkdir(parents=True, exist_ok=True)
    for name, data in zip(_names(key), (full, thumb), strict=True):
        (folder / name).write_bytes(data)


def delete_photos(keys: Iterable[str]) -> None:
    """Best effort: a file that can't be removed is logged, never surfaced to the user."""
    folder = photo_folder()
    for key in keys:
        for name in _names(key):
            try:
                (folder / name).unlink(missing_ok=True)
            except OSError:
                logger.warning("Could not delete photo file %s", name, exc_info=True)
