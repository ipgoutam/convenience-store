
from pydantic import (
    BaseModel,
    Field,
    ConfigDict,
    field_validator,
    model_validator
)
import re
from typing import Optional, Literal
from datetime import datetime
from decimal import Decimal


class OrderItemCreate(BaseModel):
    product_id: int = Field(..., gt=0)
    quantity: int = Field(..., gt=0)



class OrderCreate(BaseModel):
    delivery_type: Literal["pickup", "delivery"]
    delivery_address: Optional[str] = None
    address_id: Optional[int] = Field(default=None, gt=0)
    customer_phone: Optional[str] = Field(
        default=None,
        min_length=10,
        max_length=15
    )
    notes: Optional[str] = Field(default=None, max_length=500)

    coupon_code: Optional[str] = Field(
        default=None,
        min_length=3,
        max_length=50
    )

    payment_method: Literal["cash", "online"]

    items: Optional[list[OrderItemCreate]] = None


    @field_validator("customer_phone")
    @classmethod
    def validate_phone(cls, value):
        if value is None:
            return None

        value = value.strip()
        normalized = re.sub(r"[\s-]", "", value)

        if not re.fullmatch(r"[0-9]{10}", normalized):
            raise ValueError("Phone number must contain exactly 10 digits")

        return normalized

    @field_validator("delivery_address")
    @classmethod
    def clean_address(cls, value):
        if value is not None:
            value = value.strip()
            if not value:
                return None
        return value

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, value):
        if value is not None:
            value = value.strip()
            if not value:
                return None
        return value

    
    @model_validator(mode="after")
    def validate_order_details(self):
        # Validate delivery address
        if self.delivery_type == "delivery":
            if self.address_id is None and not self.delivery_address:
                raise ValueError(
                    "Delivery address or saved address is required"
                )

        if self.delivery_type == "pickup":
            self.delivery_address = None

        # Prevent duplicate products when items are provided
        if self.items:
            product_ids = [item.product_id for item in self.items]

            if len(product_ids) != len(set(product_ids)):
                raise ValueError(
                    "Each product can appear only once in an order"
                )

        return self


class OrderItemResponse(BaseModel):
    id: int
    product_id: Optional[int]
    product_name: str
    unit_price: Decimal
    quantity: int
    line_total: Decimal

    model_config = ConfigDict(from_attributes=True)


class OrderResponse(BaseModel):
    id: int
    order_number: str
    customer_id: int

    delivery_type: str
    delivery_address: Optional[str]
    customer_phone: Optional[str] = None
    notes: Optional[str]

    subtotal: Decimal
    delivery_fee: Decimal
    coupon_code: Optional[str]
    discount_amount: Decimal
    total_amount: Decimal

    payment_method: str
    payment_status: str
    order_status: str

    created_at: Optional[datetime]

    items: list[OrderItemResponse]

    model_config = ConfigDict(from_attributes=True)


class OrderStatusUpdate(BaseModel):
    order_status: Literal[
        "confirmed",
        "preparing",
        "ready_for_pickup",
        "out_for_delivery",
        "completed",
        "cancelled"
    ]

class PaymentStatusUpdate(BaseModel):
    payment_status: Literal[
        "paid",
        "failed",
        "refunded"
    ]