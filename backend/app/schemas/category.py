
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional
from datetime import datetime


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None
    image_url: Optional[str] = None
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        value = value.strip()

        if len(value) < 2:
            raise ValueError("Category name must contain at least 2 characters")

        return value

    @field_validator("description")
    @classmethod
    def clean_description(cls, value):
        return value.strip() if value else value


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    description: Optional[str] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        if value is not None:
            value = value.strip()

            if len(value) < 2:
                raise ValueError("Category name must contain at least 2 characters")

        return value

    @field_validator("description")
    @classmethod
    def clean_description(cls, value):
        return value.strip() if value else value


class CategoryResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    image_url: Optional[str]
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
