
from sqlalchemy import (
    Column, Integer, String, Boolean,
    DateTime, ForeignKey, func
)
from app.database import Base


class Address(Base):
    __tablename__ = "addresses"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    label = Column(String(50), default="Home", nullable=False)
    recipient_name = Column(String(150), nullable=False)
    phone = Column(String(15), nullable=False)

    address_line = Column(String(500), nullable=False)
    landmark = Column(String(200), nullable=True)

    city = Column(String(100), nullable=False)
    state = Column(String(100), nullable=False)
    pincode = Column(String(10), nullable=False)

    is_default = Column(Boolean, default=False, nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )
