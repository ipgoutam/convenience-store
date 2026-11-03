
from pydantic import BaseModel, Field, ConfigDict, model_validator
from typing import Optional
from datetime import time
from decimal import Decimal


class StoreSettingCreate(BaseModel):
    store_name: str = Field(
        default="Convenience Store",
        min_length=2,
        max_length=150
    )

    phone: Optional[str] = Field(
        default=None,
        min_length=10,
        max_length=15
    )

    address: Optional[str] = Field(
        default=None,
        max_length=500
    )

    opening_time: time = time(7, 0)
    closing_time: time = time(22, 0)

    is_open: bool = True

    delivery_fee: Decimal = Field(
        default=Decimal("0.00"),
        ge=0,
        max_digits=10,
        decimal_places=2
    )
    @model_validator(mode="after")
    def validate_store_hours(self):
        if self.closing_time <= self.opening_time:
            raise ValueError(
                "Closing time must be later than opening time"
            )

        return self


class StoreSettingUpdate(BaseModel):
    store_name: Optional[str] = Field(
        default=None,
        min_length=2,
        max_length=150
    )

    phone: Optional[str] = Field(
        default=None,
        min_length=10,
        max_length=15
    )

    address: Optional[str] = Field(
        default=None,
        max_length=500
    )

    opening_time: Optional[time] = None
    closing_time: Optional[time] = None
    is_open: Optional[bool] = None

    delivery_fee: Optional[Decimal] = Field(
        default=None,
        ge=0,
        max_digits=10,
        decimal_places=2
    )


class StoreSettingResponse(BaseModel):
    id: int
    store_name: str
    phone: Optional[str]
    address: Optional[str]
    opening_time: time
    closing_time: time
    is_open: bool
    delivery_fee: Decimal

    model_config = ConfigDict(from_attributes=True)
