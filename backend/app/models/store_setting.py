from sqlalchemy import Column, Integer, String, Boolean, Time, Numeric
from app.database import Base


class StoreSetting(Base):
    __tablename__ = "store_settings"

    id = Column(Integer, primary_key=True, index=True)

    store_name = Column(
        String(150),
        nullable=False,
        default="Convenience Store"
    )

    phone = Column(String(15), nullable=True)
    address = Column(String(500), nullable=True)

    opening_time = Column(Time, nullable=False)
    closing_time = Column(Time, nullable=False)

    is_open = Column(Boolean, default=True, nullable=False)

    online_payment_enabled = Column(
        Boolean,
        default=False,
        nullable=False
    )

    delivery_fee = Column(
        Numeric(10, 2),
        default=0,
        nullable=False
    )