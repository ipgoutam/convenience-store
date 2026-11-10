
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, datetime
from typing import Optional, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    computed_field,
    field_validator,
    model_validator,
    TypeAdapter,
    HttpUrl
)


# Supported product selling units
ProductUnit = Literal[
    "piece",
    "packet",
    "bottle",
    "kg",
    "g",
    "litre",
    "ml"
]

# Validate image URLs but store them as strings
url_adapter = TypeAdapter(HttpUrl)


# Common text cleaning
def clean_text(value):
    if value is None:
        return value

    value = value.strip()

    return value if value else None


# Used when adding a product
class ProductCreate(BaseModel):

    # Basic information
    name: str = Field(..., min_length=2, max_length=150)
    description: Optional[str] = None
    brand: Optional[str] = Field(default=None, max_length=100)
    brand_id: Optional[int] = Field(default=None, ge=1)
    category: str = Field(..., min_length=2, max_length=100)

    # Identification
    sku: Optional[str] = Field(default=None, max_length=100)
    barcode: Optional[str] = Field(default=None, max_length=100)

    # Pricing
    price: Decimal = Field(..., gt=0, max_digits=10, decimal_places=2)
    mrp: Optional[Decimal] = Field(
        default=None, gt=0, max_digits=10, decimal_places=2
    )
    cost_price: Optional[Decimal] = Field(
        default=None, ge=0, max_digits=10, decimal_places=2
    )

    discount_percentage: Decimal = Field(
        default=Decimal("0"),
        ge=0,
        le=100,
        max_digits=5,
        decimal_places=2
    )

    # Selling unit
    unit: ProductUnit = "piece"
    allow_purchase_by_amount: bool = False

    # Inventory
    stock: int = Field(default=0, ge=0)
    low_stock_threshold: Optional[int] = Field(default=None, ge=0)

    # Additional information
    image_url: Optional[str] = None
    expiry_date: Optional[date] = None

    @field_validator(
        "name", "category", "description", "brand", "sku", "barcode"
    )
    @classmethod
    def clean_text_fields(cls, value):
        return clean_text(value)

    @field_validator("image_url")
    @classmethod
    def validate_image_url(cls, value):
        if value is None:
            return None

        return str(url_adapter.validate_python(value))

    @model_validator(mode="after")
    def validate_prices(self):
        if self.mrp is not None and self.price > self.mrp:
            raise ValueError("Selling price cannot be greater than MRP")

        return self


# Used when updating a product
class ProductUpdate(BaseModel):

    name: Optional[str] = Field(default=None, min_length=2, max_length=150)
    description: Optional[str] = None
    brand: Optional[str] = Field(default=None, max_length=100)
    brand_id: Optional[int] = Field(default=None, ge=1)
    category: Optional[str] = Field(
        default=None, min_length=2, max_length=100
    )

    sku: Optional[str] = Field(default=None, max_length=100)
    barcode: Optional[str] = Field(default=None, max_length=100)

    price: Optional[Decimal] = Field(
        default=None, gt=0, max_digits=10, decimal_places=2
    )
    mrp: Optional[Decimal] = Field(
        default=None, gt=0, max_digits=10, decimal_places=2
    )
    cost_price: Optional[Decimal] = Field(
        default=None, ge=0, max_digits=10, decimal_places=2
    )

    discount_percentage: Optional[Decimal] = Field(
        default=None,
        ge=0,
        le=100,
        max_digits=5,
        decimal_places=2
    )

    unit: Optional[ProductUnit] = None
    allow_purchase_by_amount: Optional[bool] = None

    stock: Optional[int] = Field(default=None, ge=0)
    low_stock_threshold: Optional[int] = Field(default=None, ge=0)

    image_url: Optional[str] = None
    expiry_date: Optional[date] = None
    is_available: Optional[bool] = None

    @field_validator(
        "name", "category", "description", "brand", "sku", "barcode"
    )
    @classmethod
    def clean_text_fields(cls, value):
        return clean_text(value)

    @field_validator("image_url")
    @classmethod
    def validate_image_url(cls, value):
        if value is None:
            return None

        return str(url_adapter.validate_python(value))

    @model_validator(mode="after")
    def validate_prices(self):
        if (
            self.mrp is not None
            and self.price is not None
            and self.price > self.mrp
        ):
            raise ValueError("Selling price cannot be greater than MRP")

        return self


# Used when returning product details
class ProductResponse(BaseModel):

    id: int

    name: str
    description: Optional[str] = None
    brand: Optional[str] = None
    brand_id: Optional[int] = None
    category: str
    popular_display_order: int = 0

    sku: Optional[str] = None
    barcode: Optional[str] = None

    price: Decimal
    mrp: Optional[Decimal] = None
    cost_price: Optional[Decimal] = None
    discount_percentage: Decimal

    unit: str
    allow_purchase_by_amount: bool

    stock: int
    low_stock_threshold: Optional[int] = None

    image_url: Optional[str] = None
    expiry_date: Optional[date] = None

    is_available: bool

    model_config = ConfigDict(from_attributes=True)
    created_at: Optional[datetime] = None

    @computed_field
    @property
    def discounted_price(self) -> Decimal:
        discount = Decimal("1") - (
            self.discount_percentage / Decimal("100")
        )

        return (self.price * discount).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP
        )
