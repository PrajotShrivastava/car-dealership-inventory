from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.models import ApplicationStatus
from app.schemas.auth import UserOut


class RejectRequest(BaseModel):
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None


class ApplicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: ApplicationStatus
    business_name: str
    phone: str | None
    message: str | None
    created_at: datetime
    reviewed_at: datetime | None
    review_note: str | None
    applicant: UserOut
