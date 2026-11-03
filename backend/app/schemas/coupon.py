
from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator
from typing import Optional, Literal
from datetime import datetime
from decimal import Decimal


class CouponCreate(BaseModel):
    code: str = Field(..., min_length=3, max_length=50)
    description: Optional[str] = None

    discount_type: Literal["percentage", "fixed"]
    discount_value: Decimal = Field(..., gt=0, max_digits=10, decimal_places=2)

    min_order_amount: Decimal = Field(
        default=Decimal("0.00"),
        ge=0,
        max_digits=10,
        decimal_places=2
    )

    max_discount_amount: Optional[Decimal] = Field(
        default=None,
        gt=0,
        max_digits=10,
        decimal_places=2
    )

    start_date: datetime
    expiry_date: datetime

    max_uses: Optional[int] = Field(default=None, gt=0)
    is_active: bool = True

    @field_validator("code")
    @classmethod
    def clean_code(cls, value):
        return value.strip().upper()

    @model_validator(mode="after")
    def validate_coupon(self):
        if self.expiry_date <= self.start_date:
            raise ValueError("Expiry date must be later than start date")

        if self.discount_type == "percentage" and self.discount_value > 100:
            raise ValueError("Percentage discount cannot exceed 100")

        if self.discount_type == "fixed" and self.max_discount_amount is not None:
            raise ValueError("Maximum discount amount is only for percentage coupons")

        return self


class CouponUpdate(BaseModel):
    description: Optional[str] = None

    discount_type: Optional[Literal["percentage", "fixed"]] = None
    discount_value: Optional[Decimal] = Field(
        default=None, gt=0, max_digits=10, decimal_places=2
    )

    min_order_amount: Optional[Decimal] = Field(
        default=None, ge=0, max_digits=10, decimal_places=2
    )

    max_discount_amount: Optional[Decimal] = Field(
        default=None, gt=0, max_digits=10, decimal_places=2
    )

    start_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None

    max_uses: Optional[int] = Field(default=None, gt=0)
    is_active: Optional[bool] = None


class CouponResponse(BaseModel):
    id: int
    code: str
    description: Optional[str]
    discount_type: str
    discount_value: Decimal
    min_order_amount: Decimal
    max_discount_amount: Optional[Decimal]
    start_date: datetime
    expiry_date: datetime
    max_uses: Optional[int]
    usage_count: int
    is_active: bool
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CouponValidate(BaseModel):
    code: str = Field(..., min_length=3, max_length=50)
    order_amount: Decimal = Field(..., gt=0, max_digits=10, decimal_places=2)

    @field_validator("code")
    @classmethod
    def clean_code(cls, value):
        return value.strip().upper()
