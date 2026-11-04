
from sqlalchemy import (
    Column,
    Integer,
    String,
    Numeric,
    DateTime,
    ForeignKey,
    func
)
from app.database import Base


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)

    order_id = Column(
        Integer,
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    razorpay_order_id = Column(
        String(100),
        unique=True,
        nullable=False,
        index=True
    )

    razorpay_payment_id = Column(
        String(100),
        unique=True,
        nullable=True
    )
    razorpay_refund_id = Column(
        String(100),
        unique=True,
        nullable=True
    )

    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(10), default="INR", nullable=False)

    status = Column(
        String(20),
        default="pending",
        nullable=False
    )

    payment_method = Column(String(30), nullable=True)
    failure_reason = Column(String(500), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
