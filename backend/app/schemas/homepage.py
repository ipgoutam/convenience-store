
from typing import Optional
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.product import ProductResponse

# Admin: Reorder all hero carousel products
class HomepageHeroReorderRequest(BaseModel):
    entry_ids: list[int] = Field(..., min_length=1)

    @field_validator("entry_ids")
    @classmethod
    def validate_entry_ids(cls, value):
        if any(entry_id < 1 for entry_id in value):
            raise ValueError("Entry IDs must be positive")

        if len(value) != len(set(value)):
            raise ValueError("Duplicate hero entry IDs are not allowed")

        return value

# Admin: Add a product to the hero carousel
class HomepageHeroProductCreate(BaseModel):
    product_id: int = Field(..., ge=1)
    display_order: int = Field(default=0, ge=0)
    is_visible: bool = True


# Admin: Update a hero carousel entry
class HomepageHeroProductUpdate(BaseModel):
    display_order: Optional[int] = Field(default=None, ge=0)
    is_visible: Optional[bool] = None


# Response: Hero carousel entry
class HomepageHeroProductResponse(BaseModel):
    id: int
    product_id: int
    display_order: int
    is_visible: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    product: ProductResponse

    model_config = ConfigDict(from_attributes=True)
