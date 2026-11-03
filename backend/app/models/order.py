
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Numeric, func
from sqlalchemy.orm import relationship

from app.database import Base


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)

    order_number = Column(String(36), unique=True, nullable=False, index=True)

    customer_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True
    )

    # pickup or delivery
    delivery_type = Column(String(20), nullable=False)

    delivery_address = Column(Text, nullable=True)
    customer_phone = Column(String(15), nullable=True)
    notes = Column(Text, nullable=True)

    # Order amounts
    subtotal = Column(Numeric(10, 2), nullable=False)
    delivery_fee = Column(Numeric(10, 2), default=0, nullable=False)

    # Coupon discount information
    coupon_code = Column(String(50), nullable=True)
    discount_amount = Column(
        Numeric(10, 2),
        default=0,
        nullable=False
    )

    total_amount = Column(Numeric(10, 2), nullable=False)

    # cash or online
    payment_method = Column(String(20), nullable=False)

    # pending, paid, failed, refunded
    payment_status = Column(String(20), default="pending", nullable=False)

    # pending, confirmed, preparing, ready_for_pickup,
    # out_for_delivery, completed, cancelled
    order_status = Column(String(30), default="pending", nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )

    # Relationship with order items
    items = relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete-orphan"
    )
