from typing import Annotated

from fastapi import APIRouter, Depends, File, Path, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.media import delete_photos
from app.models import Role, User, Vehicle
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
from app.security import get_current_user, owned_by, require_inventory_manager
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


def _get_or_404(db: Session, vehicle_id: int, user: User) -> Vehicle:
    """The vehicle, if `user` may see it. Another dealer's vehicle is reported as missing,
    the same as one that doesn't exist, so its id reveals nothing."""
    vehicle = db.get(Vehicle, vehicle_id)
    dealer_id = owned_by(user)
    if vehicle is None or (dealer_id is not None and vehicle.dealer_id != dealer_id):
        raise vehicle_not_found(vehicle_id)
    return vehicle


def _out(vehicle: Vehicle, user: User) -> VehicleOut:
    """The vehicle as `user` may see it: acquisition cost only for its dealer and admins.

    (Dealers only ever reach their own vehicles, so any dealer here is the owner.)
    """
    out = VehicleOut.model_validate(vehicle)
    if user.role not in (Role.DEALER, Role.ADMIN):
        out.acquisition_cost = None
    return out


def _list(db: Session, query: VehicleQuery, user: User) -> VehicleList:
    items, total, counts = search_vehicles(db, query, owned_by(user))
    return VehicleList(items=[_out(v, user) for v in items], total=total, counts=counts)


@router.get("", response_model=VehicleList)
def list_vehicles(
    query: Annotated[VehicleQuery, Query()],
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> VehicleList:
    return _list(db, query, user)


@router.get("/search", response_model=VehicleList)
def search(
    query: Annotated[VehicleQuery, Query()],
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> VehicleList:
    """Search/filter inventory. Same parameters as the list endpoint."""
    return _list(db, query, user)


@router.get("/{vehicle_id}", response_model=VehicleOut)
def get_vehicle(
    vehicle_id: VehicleId, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> VehicleOut:
    return _out(_get_or_404(db, vehicle_id, user), user)


@router.post("", response_model=VehicleOut, status_code=status.HTTP_201_CREATED)
def create_vehicle(
    payload: VehicleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_inventory_manager),
) -> VehicleOut:
    vehicle = Vehicle(**payload.model_dump(), dealer_id=owned_by(user))
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return _out(vehicle, user)


@router.put("/{vehicle_id}", response_model=VehicleOut)
def update_vehicle(
    vehicle_id: VehicleId,
    payload: VehicleUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_inventory_manager),
) -> VehicleOut:
    vehicle = _get_or_404(db, vehicle_id, user)
    for field, value in payload.model_dump().items():
        setattr(vehicle, field, value)
    db.commit()
    db.refresh(vehicle)
    return _out(vehicle, user)


@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle(
    vehicle_id: VehicleId,
    db: Session = Depends(get_db),
    user: User = Depends(require_inventory_manager),
) -> Response:
    vehicle = _get_or_404(db, vehicle_id, user)
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
    user: User = Depends(require_inventory_manager),
) -> VehicleOut:
    _get_or_404(db, vehicle_id, user)
    # Reading one byte past the limit is enough to tell an oversized file apart.
    files_data = [upload.file.read(MAX_PHOTO_BYTES + 1) for upload in files]
    return _out(add_photos(db, vehicle_id, files_data), user)


@router.delete("/{vehicle_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(
    vehicle_id: VehicleId,
    photo_id: PhotoId,
    db: Session = Depends(get_db),
    user: User = Depends(require_inventory_manager),
) -> Response:
    _get_or_404(db, vehicle_id, user)
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
    _get_or_404(db, vehicle_id, user)
    record = purchase_vehicle(db, vehicle_id, user.id, quantity)
    return PurchaseResult(
        purchase=PurchaseOut.model_validate(record),
        vehicle=_out(_get_or_404(db, vehicle_id, user), user),
    )


@router.post("/{vehicle_id}/restock", response_model=VehicleOut)
def restock(
    vehicle_id: VehicleId,
    payload: RestockRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_inventory_manager),
) -> VehicleOut:
    _get_or_404(db, vehicle_id, user)
    return _out(restock_vehicle(db, vehicle_id, payload.quantity), user)
