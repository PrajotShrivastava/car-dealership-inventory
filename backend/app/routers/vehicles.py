from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import AppError
from app.models import User, Vehicle
from app.schemas.vehicles import VehicleCreate, VehicleList, VehicleOut, VehicleUpdate
from app.security import get_current_user, require_admin

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


def _get_or_404(db: Session, vehicle_id: int) -> Vehicle:
    vehicle = db.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise AppError(404, "VEHICLE_NOT_FOUND", f"Vehicle {vehicle_id} not found")
    return vehicle


@router.get("", response_model=VehicleList)
def list_vehicles(
    db: Session = Depends(get_db), _: User = Depends(get_current_user)
) -> VehicleList:
    items = db.scalars(select(Vehicle).order_by(Vehicle.created_at.desc(), Vehicle.id.desc()))
    total = db.scalar(select(func.count()).select_from(Vehicle)) or 0
    return VehicleList(items=[VehicleOut.model_validate(v) for v in items], total=total)


@router.get("/{vehicle_id}", response_model=VehicleOut)
def get_vehicle(
    vehicle_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
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
    vehicle_id: int,
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
    vehicle_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)
) -> Response:
    db.delete(_get_or_404(db, vehicle_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
