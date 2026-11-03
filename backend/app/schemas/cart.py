
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional


class CartItemAdd(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(default=1, gt=0)


class CartItemUpdate(BaseModel):
    quantity: int = Field(gt=0)


class CartItemResponse(BaseModel):
    id: int
    product_id: int
    product_name: str
    image_url: Optional[str] = None
    unit_price: float
    discount_percentage: float
    discounted_price: float
    quantity: int
    line_total: float
    stock: int
    is_available: bool

    model_config = ConfigDict(from_attributes=True)


class CartResponse(BaseModel):
    id: int
    user_id: int
    items: List[CartItemResponse]
    total_items: int
    subtotal: float

    model_config = ConfigDict(from_attributes=True)
