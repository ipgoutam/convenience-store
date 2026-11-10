
from sqlalchemy import Column, Integer, String, Boolean, DateTime, func, JSON
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    full_name = Column(String(150), nullable=False)

    email = Column(String(150), unique=True, nullable=True, index=True)

    phone = Column(String(15), unique=True, nullable=True)

    hashed_password = Column(String(255), nullable=False)

    role = Column(String(20), default="customer", nullable=False)

    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
    section_permissions = Column(
        JSON,
        nullable=False,
        default=dict
    )
