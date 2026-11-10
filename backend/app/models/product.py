from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    ForeignKey,
    Date,
    DateTime,
    Numeric,
    func
)

from app.database import Base


class Product(Base):
    __tablename__ = "products"

    # Primary identification
    id = Column(Integer, primary_key=True, index=True)

    # Basic product information
    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)

    # Brand relationship
    brand_id = Column(
        Integer,
        ForeignKey("brands.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    # Keep old brand name temporarily for backward compatibility
    brand = Column(String(100), nullable=True)

    category = Column(String(100), nullable=False)
    
    # Product order inside Popular Categories carousels
    popular_display_order = Column(
        Integer,
        default=0,
        nullable=False
    )
    
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
    unit = Column(String(20), default="piece", nullable=False)

    # Purchase options
    allow_purchase_by_amount = Column(
        Boolean,
        default=False,
        nullable=False
    )

    # Inventory
    stock = Column(Integer, default=0, nullable=False)
    low_stock_threshold = Column(Integer, nullable=True)

    # Additional information
    image_url = Column(String(500), nullable=True)
    expiry_date = Column(Date, nullable=True)

    # Product availability
    is_available = Column(Boolean, default=True, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )