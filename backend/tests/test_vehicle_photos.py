"""Admins upload their own vehicle photos; everyone sees them on the vehicle."""

import io
import re
from pathlib import Path

import pytest
from PIL import Image

from app.config import get_settings

PHOTO_URL = re.compile(r"^/api/media/vehicles/[0-9a-f]{32}\.webp$")
THUMB_URL = re.compile(r"^/api/media/vehicles/[0-9a-f]{32}-thumb\.webp$")
MB = 1024 * 1024


def image_bytes(fmt: str = "JPEG", size: tuple[int, int] = (800, 600), **save_args) -> bytes:
    buffer = io.BytesIO()
    mode = "1" if fmt == "PNG" and size[0] * size[1] > 50_000_000 else "RGB"
    Image.new(mode, size, color=1 if mode == "1" else (30, 120, 60)).save(buffer, fmt, **save_args)
    return buffer.getvalue()


def jpeg_with_metadata(size: tuple[int, int], orientation: int | None = None) -> bytes:
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"  # camera make
    exif[0x0131] = "PhoneCamera 1.0"  # software
    if orientation:
        exif[0x0112] = orientation
    exif.get_ifd(0x8825).update({1: "N", 2: (51.0, 30.0, 12.0), 3: "W", 4: (0.0, 7.0, 39.0)})
    return image_bytes("JPEG", size, exif=exif)


def files(*payloads: bytes, name: str = "car.jpg", content_type: str = "image/jpeg"):
    return [("files", (f"{i}-{name}", payload, content_type)) for i, payload in enumerate(payloads)]


def media_files() -> set[str]:
    folder = Path(get_settings().media_dir) / "vehicles"
    return {p.name for p in folder.glob("*")} if folder.exists() else set()


def stored_path(url: str) -> Path:
    return Path(get_settings().media_dir) / "vehicles" / url.rsplit("/", 1)[-1]


@pytest.fixture
def upload(client, admin_headers):
    def _upload(vehicle_id: int, *payloads: bytes, headers=None, **kwargs):
        return client.post(
            f"/api/vehicles/{vehicle_id}/photos",
            files=files(*payloads, **kwargs),
            headers=admin_headers if headers is None else headers,
        )

    return _upload


class TestUpload:
    def test_admin_uploads_several_photos_at_once(self, upload, make_vehicle):
        vehicle = make_vehicle()

        response = upload(vehicle["id"], image_bytes(), image_bytes())

        assert response.status_code == 201, response.text
        photos = response.json()["photos"]
        assert len(photos) == 2
        for photo in photos:
            assert PHOTO_URL.match(photo["url"])
            assert THUMB_URL.match(photo["thumb_url"])
            assert isinstance(photo["id"], int)
        assert photos[0]["url"] != photos[1]["url"]

    def test_photos_are_shown_on_the_vehicle_in_upload_order(
        self, client, upload, make_vehicle, customer_headers
    ):
        vehicle = make_vehicle()
        first = upload(vehicle["id"], image_bytes()).json()["photos"]
        second = upload(vehicle["id"], image_bytes(), image_bytes()).json()["photos"]

        detail = client.get(f"/api/vehicles/{vehicle['id']}", headers=customer_headers).json()
        listing = client.get("/api/vehicles/search", headers=customer_headers).json()

        assert [p["id"] for p in second[:1]] == [p["id"] for p in first]
        assert detail["photos"] == second
        assert listing["items"][0]["photos"] == second

    def test_vehicles_without_photos_have_an_empty_list(
        self, client, make_vehicle, customer_headers
    ):
        vehicle = make_vehicle()

        body = client.get(f"/api/vehicles/{vehicle['id']}", headers=customer_headers).json()

        assert body["photos"] == []

    @pytest.mark.parametrize(
        ("fmt", "content_type"),
        [("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp")],
    )
    def test_accepts_jpeg_png_and_webp(self, upload, make_vehicle, fmt, content_type):
        vehicle = make_vehicle()

        response = upload(
            vehicle["id"], image_bytes(fmt), name=f"car.{fmt.lower()}", content_type=content_type
        )

        assert response.status_code == 201, response.text

    def test_uploaded_photos_are_served_as_webp(self, client, upload, make_vehicle):
        vehicle = make_vehicle()
        photo = upload(vehicle["id"], image_bytes()).json()["photos"][0]

        for url in (photo["url"], photo["thumb_url"]):
            response = client.get(url)
            assert response.status_code == 200
            assert response.headers["content-type"] == "image/webp"
            assert Image.open(io.BytesIO(response.content)).format == "WEBP"

    def test_large_photos_are_resized_and_a_thumbnail_is_made(self, upload, make_vehicle):
        vehicle = make_vehicle()
        photo = upload(vehicle["id"], image_bytes(size=(4000, 3000))).json()["photos"][0]

        full = Image.open(stored_path(photo["url"]))
        thumb = Image.open(stored_path(photo["thumb_url"]))
        assert full.size == (1600, 1200)
        assert thumb.size == (400, 300)

    def test_small_photos_are_not_enlarged(self, upload, make_vehicle):
        vehicle = make_vehicle()
        photo = upload(vehicle["id"], image_bytes(size=(320, 240))).json()["photos"][0]

        assert Image.open(stored_path(photo["url"])).size == (320, 240)

    def test_location_and_camera_metadata_are_removed(self, upload, make_vehicle):
        vehicle = make_vehicle()
        photo = upload(vehicle["id"], jpeg_with_metadata((800, 600))).json()["photos"][0]

        for url in (photo["url"], photo["thumb_url"]):
            saved = Image.open(stored_path(url))
            assert dict(saved.getexif()) == {}
            assert "exif" not in saved.info

    def test_phone_rotation_is_applied_before_metadata_is_dropped(self, upload, make_vehicle):
        vehicle = make_vehicle()
        # Orientation 6: stored landscape, meant to be shown rotated to portrait.
        payload = jpeg_with_metadata((800, 600), orientation=6)

        photo = upload(vehicle["id"], payload).json()["photos"][0]

        assert Image.open(stored_path(photo["url"])).size == (600, 800)

    def test_transparent_png_keeps_its_transparency(self, upload, make_vehicle):
        vehicle = make_vehicle()
        buffer = io.BytesIO()
        Image.new("RGBA", (200, 100), (0, 0, 0, 0)).save(buffer, "PNG")

        photo = upload(vehicle["id"], buffer.getvalue(), name="car.png", content_type="image/png")

        assert Image.open(stored_path(photo.json()["photos"][0]["url"])).mode == "RGBA"

    def test_editing_a_vehicle_keeps_its_photos(self, client, upload, make_vehicle, admin_headers):
        vehicle = make_vehicle()
        photos = upload(vehicle["id"], image_bytes()).json()["photos"]
        fields = {
            k: v
            for k, v in vehicle.items()
            if k not in ("id", "quantity", "photos", "accepts_enquiries")
        }

        response = client.put(
            f"/api/vehicles/{vehicle['id']}",
            json={**fields, "price": "1.00"},
            headers=admin_headers,
        )

        assert response.json()["photos"] == photos

    def test_restock_and_purchase_responses_include_photos(
        self, client, upload, make_vehicle, admin_headers, customer_headers
    ):
        vehicle = make_vehicle()
        photos = upload(vehicle["id"], image_bytes()).json()["photos"]

        restocked = client.post(
            f"/api/vehicles/{vehicle['id']}/restock", json={"quantity": 1}, headers=admin_headers
        )
        bought = client.post(
            f"/api/vehicles/{vehicle['id']}/purchase",
            json={"quantity": 1},
            headers=customer_headers,
        )

        assert restocked.json()["photos"] == photos
        assert bought.json()["vehicle"]["photos"] == photos


class TestUploadIsRestricted:
    def test_requires_authentication(self, client, make_vehicle):
        vehicle = make_vehicle()

        response = client.post(f"/api/vehicles/{vehicle['id']}/photos", files=files(image_bytes()))

        assert response.status_code == 401

    def test_customers_cannot_upload(self, upload, make_vehicle, customer_headers):
        vehicle = make_vehicle()
        before = media_files()

        response = upload(vehicle["id"], image_bytes(), headers=customer_headers)

        assert response.status_code == 403
        assert media_files() == before

    def test_unknown_vehicle_is_404(self, upload):
        response = upload(999, image_bytes())

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "VEHICLE_NOT_FOUND"

    def test_at_least_one_file_is_required(self, client, make_vehicle, admin_headers):
        vehicle = make_vehicle()

        response = client.post(f"/api/vehicles/{vehicle['id']}/photos", headers=admin_headers)

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"


class TestUploadValidation:
    def test_rejects_a_file_that_is_not_an_image(self, upload, make_vehicle):
        vehicle = make_vehicle()
        before = media_files()

        response = upload(vehicle["id"], b"#!/bin/sh\necho not a photo\n")

        assert response.status_code == 415
        assert response.json()["error"]["code"] == "UNSUPPORTED_PHOTO_TYPE"
        assert media_files() == before

    def test_rejects_other_image_formats(self, upload, make_vehicle):
        vehicle = make_vehicle()

        response = upload(
            vehicle["id"], image_bytes("GIF"), name="car.gif", content_type="image/gif"
        )

        assert response.status_code == 415
        assert response.json()["error"]["code"] == "UNSUPPORTED_PHOTO_TYPE"

    def test_trusts_the_file_contents_not_its_name_or_declared_type(self, upload, make_vehicle):
        vehicle = make_vehicle()

        response = upload(
            vehicle["id"], image_bytes("GIF"), name="car.jpg", content_type="image/jpeg"
        )

        assert response.status_code == 415

    def test_rejects_files_over_5_mb(self, upload, make_vehicle):
        vehicle = make_vehicle()

        response = upload(vehicle["id"], b"\xff" * (5 * MB + 1))

        assert response.status_code == 413
        assert response.json()["error"]["code"] == "PHOTO_TOO_LARGE"

    def test_rejects_images_with_huge_dimensions(self, upload, make_vehicle):
        vehicle = make_vehicle()
        # A tiny file that would expand to 144 million pixels in memory.
        payload = image_bytes("PNG", size=(12_000, 12_000))
        assert len(payload) < 5 * MB

        response = upload(vehicle["id"], payload, name="car.png", content_type="image/png")

        assert response.status_code == 413
        assert response.json()["error"]["code"] == "PHOTO_TOO_LARGE"

    def test_one_bad_file_rejects_the_whole_upload(
        self, client, upload, make_vehicle, admin_headers
    ):
        vehicle = make_vehicle()
        before = media_files()

        response = upload(vehicle["id"], image_bytes(), b"not an image")

        assert response.status_code == 415
        assert media_files() == before
        body = client.get(f"/api/vehicles/{vehicle['id']}", headers=admin_headers).json()
        assert body["photos"] == []


class TestPhotoLimit:
    def test_allows_up_to_10_photos(self, upload, make_vehicle):
        vehicle = make_vehicle()

        response = upload(vehicle["id"], *[image_bytes(size=(64, 48))] * 10)

        assert response.status_code == 201
        assert len(response.json()["photos"]) == 10

    def test_rejects_an_upload_that_would_exceed_10(
        self, client, upload, make_vehicle, admin_headers
    ):
        vehicle = make_vehicle()
        upload(vehicle["id"], *[image_bytes(size=(64, 48))] * 8)
        before = media_files()

        response = upload(vehicle["id"], *[image_bytes(size=(64, 48))] * 3)

        assert response.status_code == 409
        assert response.json()["error"]["code"] == "PHOTO_LIMIT_EXCEEDED"
        assert media_files() == before
        body = client.get(f"/api/vehicles/{vehicle['id']}", headers=admin_headers).json()
        assert len(body["photos"]) == 8


class TestDeletePhoto:
    def test_admin_removes_one_photo(self, client, upload, make_vehicle, admin_headers):
        vehicle = make_vehicle()
        keep, remove = upload(vehicle["id"], image_bytes(), image_bytes()).json()["photos"]

        response = client.delete(
            f"/api/vehicles/{vehicle['id']}/photos/{remove['id']}", headers=admin_headers
        )

        assert response.status_code == 204
        body = client.get(f"/api/vehicles/{vehicle['id']}", headers=admin_headers).json()
        assert body["photos"] == [keep]
        assert not stored_path(remove["url"]).exists()
        assert not stored_path(remove["thumb_url"]).exists()
        assert stored_path(keep["url"]).exists()

    def test_requires_admin(self, client, upload, make_vehicle, customer_headers):
        vehicle = make_vehicle()
        photo = upload(vehicle["id"], image_bytes()).json()["photos"][0]
        path = f"/api/vehicles/{vehicle['id']}/photos/{photo['id']}"

        assert client.delete(path).status_code == 401
        assert client.delete(path, headers=customer_headers).status_code == 403
        assert stored_path(photo["url"]).exists()

    def test_photo_must_belong_to_the_vehicle(self, client, upload, make_vehicle, admin_headers):
        first, second = make_vehicle(), make_vehicle(model="Puma")
        photo = upload(first["id"], image_bytes()).json()["photos"][0]

        response = client.delete(
            f"/api/vehicles/{second['id']}/photos/{photo['id']}", headers=admin_headers
        )

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "PHOTO_NOT_FOUND"
        assert stored_path(photo["url"]).exists()

    def test_unknown_photo_is_404(self, client, make_vehicle, admin_headers):
        vehicle = make_vehicle()

        response = client.delete(
            f"/api/vehicles/{vehicle['id']}/photos/12345", headers=admin_headers
        )

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "PHOTO_NOT_FOUND"

    def test_deleting_a_vehicle_deletes_its_photo_files(
        self, client, upload, make_vehicle, admin_headers
    ):
        vehicle = make_vehicle()
        photos = upload(vehicle["id"], image_bytes(), image_bytes()).json()["photos"]

        response = client.delete(f"/api/vehicles/{vehicle['id']}", headers=admin_headers)

        assert response.status_code == 204
        for photo in photos:
            assert not stored_path(photo["url"]).exists()
            assert not stored_path(photo["thumb_url"]).exists()
