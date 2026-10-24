from typing import Annotated

from fastapi import APIRouter, Depends, File, Path, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.media import delete_photos
from app.models import User, Vehicle
from app.schemas.vehicles import (
    PurchaseOut,
    PurchaseRequest,
    PurchaseResult,
    RestockRequest,
    VehicleCreate,
    VehicleList,
    VehicleOut,
    VehicleQuery,
    VehicleUpdate,
)
from app.security import get_current_user, require_admin
from app.services.inventory import (
    purchase_vehicle,
    restock_vehicle,
    search_vehicles,
    vehicle_not_found,
)
from app.services.photos import MAX_PHOTO_BYTES, add_photos, remove_photo

router = APIRouter(prefix="/vehicles", tags=["vehicles"])

# Bounded to Postgres INTEGER so oversized ids get a 422 instead of a DB error.
VehicleId = Annotated[int, Path(ge=1, le=2_147_483_647)]
PhotoId = Annotated[int, Path(ge=1, le=2_147_483_647)]


def _get_or_404(db: Session, vehicle_id: int) -> Vehicle:
    vehicle = db.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise vehicle_not_found(vehicle_id)
    return vehicle


def _list(db: Session, query: VehicleQuery) -> VehicleList:
    items, total, counts = search_vehicles(db, query)
    return VehicleList(
        items=[VehicleOut.model_validate(v) for v in items], total=total, counts=counts
    )


@router.get("", response_model=VehicleList)
def list_vehicles(
    query: Annotated[VehicleQuery, Query()],
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> VehicleList:
    return _list(db, query)


@router.get("/search", response_model=VehicleList)
def search(
    query: Annotated[VehicleQuery, Query()],
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> VehicleList:
    """Search/filter inventory. Same parameters as the list endpoint."""
    return _list(db, query)


@router.get("/{vehicle_id}", response_model=VehicleOut)
def get_vehicle(
    vehicle_id: VehicleId, db: Session = Depends(get_db), _: User = Depends(get_current_user)
) -> Vehicle:
    return _get_or_404(db, vehicle_id)


@router.post("", response_model=VehicleOut, status_code=status.HTTP_201_CREATED)
def create_vehicle(
    payload: VehicleCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)
) -> Vehicle:
    vehicle = Vehicle(**payload.model_dump())
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@router.put("/{vehicle_id}", response_model=VehicleOut)
def update_vehicle(
    vehicle_id: VehicleId,
    payload: VehicleUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> Vehicle:
    vehicle = _get_or_404(db, vehicle_id)
    for field, value in payload.model_dump().items():
        setattr(vehicle, field, value)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle(
    vehicle_id: VehicleId, db: Session = Depends(get_db), _: User = Depends(require_admin)
) -> Response:
    vehicle = _get_or_404(db, vehicle_id)
    photo_keys = [photo.file_key for photo in vehicle.photos]
    db.delete(vehicle)
    db.commit()
    delete_photos(photo_keys)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{vehicle_id}/photos", response_model=VehicleOut, status_code=status.HTTP_201_CREATED)
def upload_photos(
    vehicle_id: VehicleId,
    files: Annotated[list[UploadFile], File(description="JPEG, PNG or WebP, up to 5 MB each")],
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> Vehicle:
    # Reading one byte past the limit is enough to tell an oversized file apart.
    return add_photos(db, vehicle_id, [upload.file.read(MAX_PHOTO_BYTES + 1) for upload in files])


@router.delete("/{vehicle_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(
    vehicle_id: VehicleId,
    photo_id: PhotoId,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> Response:
    remove_photo(db, vehicle_id, photo_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{vehicle_id}/purchase", response_model=PurchaseResult)
def purchase(
    vehicle_id: VehicleId,
    payload: PurchaseRequest | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PurchaseResult:
    quantity = payload.quantity if payload else 1
    record = purchase_vehicle(db, vehicle_id, user.id, quantity)
    return PurchaseResult(
        purchase=PurchaseOut.model_validate(record),
        vehicle=VehicleOut.model_validate(_get_or_404(db, vehicle_id)),
    )


@router.post("/{vehicle_id}/restock", response_model=VehicleOut)
def restock(
    vehicle_id: VehicleId,
    payload: RestockRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> Vehicle:
    return restock_vehicle(db, vehicle_id, payload.quantity)
