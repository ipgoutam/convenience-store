
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional
from datetime import datetime


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None
    image_url: Optional[str] = None

    is_active: bool = True

    # Homepage settings
    show_on_home: bool = True
    display_order: int = Field(default=0, ge=0)

    # Popular Categories settings
    show_in_popular: bool = False
    popular_display_order: int = Field(default=0, ge=0)

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

    # Homepage settings
    show_on_home: Optional[bool] = None
    display_order: Optional[int] = Field(default=None, ge=0)

    # Popular Categories settings
    show_in_popular: Optional[bool] = None
    popular_display_order: Optional[int] = Field(default=None, ge=0)

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
    description: Optional[str] = None
    image_url: Optional[str] = None

    is_active: bool

    show_on_home: bool
    display_order: int

    show_in_popular: bool
    popular_display_order: int

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
