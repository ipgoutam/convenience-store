
from sqlalchemy import (
    Column, Integer, String, Boolean,
    DateTime, Numeric, Text, func
)
from app.database import Base


class Coupon(Base):
    __tablename__ = "coupons"

    id = Column(Integer, primary_key=True, index=True)

    # Coupon information
    code = Column(String(50), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)

    # percentage or fixed
    discount_type = Column(String(20), nullable=False)
    discount_value = Column(Numeric(10, 2), nullable=False)

    # Minimum order amount
    min_order_amount = Column(
        Numeric(10, 2),
        default=0,
        nullable=False
    )

    # Maximum discount for percentage coupons
    max_discount_amount = Column(
        Numeric(10, 2),
        nullable=True
    )

    # Coupon validity
    start_date = Column(DateTime(timezone=True), nullable=False)
    expiry_date = Column(DateTime(timezone=True), nullable=False)

    # Usage limits
    max_uses = Column(Integer, nullable=True)
    usage_count = Column(Integer, default=0, nullable=False)

    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )
