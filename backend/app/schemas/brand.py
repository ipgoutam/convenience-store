
from typing import Optional
from datetime import datetime

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator
)


class BrandCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None
    logo_url: Optional[str] = None
    is_active: bool = True
    show_on_home: bool = True
    display_order: int = Field(default=0, ge=0)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        value = value.strip()

        if len(value) < 2:
            raise ValueError("Brand name must contain at least 2 characters")

        return value

    @field_validator("description")
    @classmethod
    def clean_description(cls, value):
        return value.strip() if value else value


class BrandUpdate(BaseModel):
    name: Optional[str] = Field(
        default=None,
        min_length=2,
        max_length=100
    )
    description: Optional[str] = None
    logo_url: Optional[str] = None
    is_active: Optional[bool] = None
    show_on_home: Optional[bool] = None
    display_order: Optional[int] = Field(default=None, ge=0)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        if value is not None:
            value = value.strip()

            if len(value) < 2:
                raise ValueError("Brand name must contain at least 2 characters")

        return value

    @field_validator("description")
    @classmethod
    def clean_description(cls, value):
        return value.strip() if value else value


class BrandResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    logo_url: Optional[str] = None
    is_active: bool
    show_on_home: bool
    display_order: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
