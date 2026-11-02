from pydantic import BaseModel, ConfigDict, computed_field, Field, field_validator, HttpUrl
from typing import Optional


# Used when adding a product
class ProductCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    description: Optional[str] = None
    price: float = Field(..., gt=0)
    stock: int = Field(default=0, ge=0)
    category: str = Field(..., min_length=2, max_length=100)
    image_url: Optional[HttpUrl] = None
    discount_percentage: float = Field(default=0, ge=0, le=100)

    @field_validator("name", "category", "description")
    @classmethod
    def remove_extra_spaces(cls, value: str) -> str:
        if value is not None:
            return value.strip()
        return value


# Used when returning product details
class ProductResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    price: float
    stock: int
    category: str
    image_url: Optional[HttpUrl]
    is_available: bool
    discount_percentage: float

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def discounted_price(self) -> float:
        return round(
            self.price * (1 - self.discount_percentage / 100), 2
        )