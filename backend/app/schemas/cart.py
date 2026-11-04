from decimal import Decimal
from typing import List, Optional, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    model_validator
)


PurchaseMode = Literal["quantity", "amount"]


# --------------------------------------------------
# ADD PRODUCT TO CART
# --------------------------------------------------

class CartItemAdd(BaseModel):

    product_id: int = Field(gt=0)

    purchase_mode: PurchaseMode = "quantity"

    quantity: Optional[Decimal] = Field(
        default=None,
        gt=0,
        max_digits=18,
        decimal_places=12
    )

    amount: Optional[Decimal] = Field(
        default=None,
        gt=0,
        max_digits=10,
        decimal_places=2
    )

    @model_validator(mode="after")
    def validate_purchase_input(self):

        if self.purchase_mode == "quantity":

            if self.quantity is None:
                raise ValueError(
                    "Quantity is required for quantity-based purchases"
                )

            if self.amount is not None:
                raise ValueError(
                    "Amount must not be provided for quantity-based purchases"
                )

        elif self.purchase_mode == "amount":

            if self.amount is None:
                raise ValueError(
                    "Amount is required for amount-based purchases"
                )

            if self.quantity is not None:
                raise ValueError(
                    "Quantity must not be provided for amount-based purchases"
                )

        return self


# --------------------------------------------------
# UPDATE CART ITEM
# --------------------------------------------------

class CartItemUpdate(BaseModel):

    purchase_mode: PurchaseMode = "quantity"

    quantity: Optional[Decimal] = Field(
        default=None,
        gt=0,
        max_digits=18,
        decimal_places=12
    )

    amount: Optional[Decimal] = Field(
        default=None,
        gt=0,
        max_digits=10,
        decimal_places=2
    )

    @model_validator(mode="after")
    def validate_purchase_input(self):

        if self.purchase_mode == "quantity":

            if self.quantity is None:
                raise ValueError(
                    "Quantity is required for quantity-based purchases"
                )

            if self.amount is not None:
                raise ValueError(
                    "Amount must not be provided for quantity-based purchases"
                )

        elif self.purchase_mode == "amount":

            if self.amount is None:
                raise ValueError(
                    "Amount is required for amount-based purchases"
                )

            if self.quantity is not None:
                raise ValueError(
                    "Quantity must not be provided for amount-based purchases"
                )

        return self


# --------------------------------------------------
# CART ITEM RESPONSE
# --------------------------------------------------

class CartItemResponse(BaseModel):

    id: int
    product_id: int

    product_name: str
    image_url: Optional[str] = None

    unit: str

    unit_price: Decimal
    discount_percentage: Decimal
    discounted_price: Decimal

    quantity: Decimal

    purchase_mode: PurchaseMode
    purchase_amount: Optional[Decimal] = None

    line_total: Decimal

    stock: int
    is_available: bool

    model_config = ConfigDict(
        from_attributes=True
    )


# --------------------------------------------------
# COMPLETE CART RESPONSE
# --------------------------------------------------

class CartResponse(BaseModel):

    id: int
    user_id: int

    items: List[CartItemResponse]

    total_items: int
    subtotal: Decimal

    model_config = ConfigDict(
        from_attributes=True
    )