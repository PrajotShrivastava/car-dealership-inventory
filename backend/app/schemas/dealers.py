from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator

from app.models import ApplicationStatus
from app.schemas.auth import RegisterRequest, UserOut


class DealerRegisterRequest(RegisterRequest):
    business_name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
    ]
    phone: (
        Annotated[
            str,
            StringConstraints(
                strip_whitespace=True, max_length=30, pattern=r"^[0-9+()\-.\s]{5,30}$"
            ),
        ]
        | None
    ) = None
    message: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None

    @field_validator("phone", "message")
    @classmethod
    def _blank_is_none(cls, value: str | None) -> str | None:
        return value or None


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


class DealerRegisterResponse(BaseModel):
    user: UserOut
    application: ApplicationOut
