
from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, func
from app.database import Base


class RefundAttempt(Base):
    __tablename__ = "refund_attempts"

    id = Column(Integer, primary_key=True, index=True)

    payment_id = Column(
        Integer,
        ForeignKey("payments.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    razorpay_refund_id = Column(
        String(100),
        unique=True,
        nullable=True,
        index=True
    )

    amount = Column(Numeric(10, 2), nullable=False)

    status = Column(
        String(20),
        default="pending",
        nullable=False
    )

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
