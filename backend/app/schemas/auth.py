from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, StringConstraints, field_validator

from app.models import Role

Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]
FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


def _normalise_email(value: str) -> str:
    return value.strip().lower()


class RegisterRequest(BaseModel):
    # Unknown fields (e.g. "role") are ignored: registration always creates a customer.
    model_config = ConfigDict(extra="ignore")

    email: EmailStr
    password: Password
    full_name: FullName

    _email = field_validator("email")(_normalise_email)


class LoginRequest(BaseModel):
    email: EmailStr
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]

    _email = field_validator("email")(_normalise_email)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    role: Role


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105  (OAuth2 token type, not a secret)
    user: UserOut
