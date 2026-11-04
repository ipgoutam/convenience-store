
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional
from datetime import datetime


class AddressCreate(BaseModel):
    label: str = Field(default="Home", min_length=2, max_length=50)
    recipient_name: str = Field(..., min_length=2, max_length=150)
    phone: str = Field(..., min_length=10, max_length=15)

    address_line: str = Field(..., min_length=5, max_length=500)
    landmark: Optional[str] = Field(default=None, max_length=200)

    city: str = Field(..., min_length=2, max_length=100)
    state: str = Field(..., min_length=2, max_length=100)
    pincode: str = Field(..., min_length=6, max_length=10)

    is_default: bool = False

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value):
        value = value.strip()

        if not value.isdigit() or len(value) != 10:
            raise ValueError("Phone number must contain exactly 10 digits")

        return value

    @field_validator("pincode")
    @classmethod
    def validate_pincode(cls, value):
        value = value.strip()

        if not value.isdigit() or len(value) != 6:
            raise ValueError("PIN code must contain exactly 6 digits")

        return value


class AddressUpdate(BaseModel):
    label: Optional[str] = Field(default=None, min_length=2, max_length=50)
    recipient_name: Optional[str] = Field(default=None, min_length=2, max_length=150)
    phone: Optional[str] = Field(default=None, min_length=10, max_length=15)

    address_line: Optional[str] = Field(default=None, min_length=5, max_length=500)
    landmark: Optional[str] = Field(default=None, max_length=200)

    city: Optional[str] = Field(default=None, min_length=2, max_length=100)
    state: Optional[str] = Field(default=None, min_length=2, max_length=100)
    pincode: Optional[str] = Field(default=None, min_length=6, max_length=10)

    is_default: Optional[bool] = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value):
        if value is None:
            return value

        value = value.strip()

        if not value.isdigit() or len(value) != 10:
            raise ValueError("Phone number must contain exactly 10 digits")

        return value

    @field_validator("pincode")
    @classmethod
    def validate_pincode(cls, value):
        if value is None:
            return value

        value = value.strip()

        if not value.isdigit() or len(value) != 6:
            raise ValueError("PIN code must contain exactly 6 digits")

        return value


class AddressResponse(BaseModel):
    id: int
    user_id: int
    label: str
    recipient_name: str
    phone: str
    address_line: str
    landmark: Optional[str]
    city: str
    state: str
    pincode: str
    is_default: bool
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
