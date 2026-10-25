"""Vehicle photos uploaded by admins: validated, cleaned and resized before they are stored."""

import io
import secrets
import warnings
from collections.abc import Sequence

from PIL import Image, ImageOps
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import AppError
from app.media import delete_photos, save_photo
from app.models import Vehicle, VehiclePhoto
from app.services.inventory import vehicle_not_found

MAX_PHOTOS_PER_VEHICLE = 10
MAX_PHOTO_BYTES = 5 * 1024 * 1024
# Rejects "decompression bombs": tiny files that expand to huge images in memory.
MAX_PHOTO_PIXELS = 40_000_000
FULL_SIZE = 1600
THUMB_SIZE = 400
_ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
_WEBP_QUALITY = 82


def _too_large(message: str) -> AppError:
    return AppError(413, "PHOTO_TOO_LARGE", message)


def _unsupported() -> AppError:
    return AppError(415, "UNSUPPORTED_PHOTO_TYPE", "Photos must be JPEG, PNG or WebP images")


def _open(data: bytes) -> Image.Image:
    """Decode and fully load the image, judging it by its contents only."""
    if len(data) > MAX_PHOTO_BYTES:
        raise _too_large("Each photo must be 5 MB or smaller")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            image = Image.open(io.BytesIO(data))
            if image.format not in _ALLOWED_FORMATS:
                raise _unsupported()
            if image.width * image.height > MAX_PHOTO_PIXELS:
                raise _too_large("Photo dimensions are too large (max 40 megapixels)")
            image.load()
    except (Image.DecompressionBombWarning, Image.DecompressionBombError) as exc:
        raise _too_large("Photo dimensions are too large (max 40 megapixels)") from exc
    except (OSError, SyntaxError, ValueError) as exc:  # what Pillow raises for non-images
        raise _unsupported() from exc
    return image


def _encode(image: Image.Image, longest_side: int) -> bytes:
    copy = image.copy()
    copy.thumbnail((longest_side, longest_side))  # keeps aspect ratio, never enlarges
    buffer = io.BytesIO()
    # Saved without exif/xmp/icc, so camera details and GPS location are dropped.
    copy.save(buffer, "WEBP", quality=_WEBP_QUALITY)
    return buffer.getvalue()


def prepare_photo(data: bytes) -> tuple[bytes, bytes]:
    """Return (full size, thumbnail) WebP bytes for an uploaded image."""
    image = ImageOps.exif_transpose(_open(data))  # apply phone rotation before dropping exif
    has_alpha = image.mode in ("RGBA", "LA", "PA") or "transparency" in image.info
    image = image.convert("RGBA" if has_alpha else "RGB")
    return _encode(image, FULL_SIZE), _encode(image, THUMB_SIZE)


def _get_vehicle(db: Session, vehicle_id: int) -> Vehicle:
    vehicle = db.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise vehicle_not_found(vehicle_id)
    return vehicle


def add_photos(db: Session, vehicle_id: int, uploads: Sequence[bytes]) -> Vehicle:
    """All or nothing: every file is checked before anything is written."""
    vehicle = _get_vehicle(db, vehicle_id)
    existing = len(vehicle.photos)
    if existing + len(uploads) > MAX_PHOTOS_PER_VEHICLE:
        raise AppError(
            409,
            "PHOTO_LIMIT_EXCEEDED",
            f"A vehicle can have at most {MAX_PHOTOS_PER_VEHICLE} photos "
            f"({existing} already uploaded)",
        )
    prepared = [prepare_photo(data) for data in uploads]

    next_position = max((photo.position for photo in vehicle.photos), default=-1) + 1
    keys = [secrets.token_hex(16) for _ in prepared]
    try:
        for key, (full, thumb) in zip(keys, prepared, strict=True):
            save_photo(key, full, thumb)
        for offset, key in enumerate(keys):
            vehicle.photos.append(VehiclePhoto(file_key=key, position=next_position + offset))
        db.commit()
    except Exception:
        db.rollback()
        delete_photos(keys)
        raise
    db.refresh(vehicle)
    return vehicle


def remove_photo(db: Session, vehicle_id: int, photo_id: int) -> None:
    photo = db.scalar(
        select(VehiclePhoto).where(
            VehiclePhoto.id == photo_id, VehiclePhoto.vehicle_id == vehicle_id
        )
    )
    if photo is None:
        raise AppError(
            404, "PHOTO_NOT_FOUND", f"Photo {photo_id} not found on vehicle {vehicle_id}"
        )
    key = photo.file_key
    db.delete(photo)
    db.commit()
    delete_photos([key])  # only after the row is gone, so no row ever points at a missing file
