
from sqlalchemy import (
    Column,
    Integer,
    String,
    Numeric,
    Boolean,
    Text,
    Date
)

from app.database import Base


class Product(Base):
    __tablename__ = "products"

    # Primary identification
    id = Column(Integer, primary_key=True, index=True)

    # Basic product information
    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    brand = Column(String(100), nullable=True)
    category = Column(String(100), nullable=False)

    # Product identification details
    sku = Column(String(100), unique=True, nullable=True, index=True)
    barcode = Column(String(100), unique=True, nullable=True, index=True)

    # Pricing
    price = Column(Numeric(10, 2), nullable=False)
    mrp = Column(Numeric(10, 2), nullable=True)
    cost_price = Column(Numeric(10, 2), nullable=True)
    discount_percentage = Column(
        Numeric(5, 2),
        default=0,
        nullable=False
    )

    # Selling unit
    # piece, packet, bottle, kg, g, litre, ml
    unit = Column(String(20), default="piece", nullable=False)

    # Inventory
    # Stock is maintained in whole units.
    stock = Column(Integer, default=0, nullable=False)
    low_stock_threshold = Column(Integer, nullable=True)

    # Additional information
    image_url = Column(String(500), nullable=True)
    expiry_date = Column(Date, nullable=True)

    # Product availability
    is_available = Column(Boolean, default=True, nullable=False)
