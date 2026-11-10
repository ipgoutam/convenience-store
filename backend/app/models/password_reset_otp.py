
from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    func,
    Index
)

from app.database import Base


class PasswordResetOTP(Base):
    __tablename__ = "password_reset_otps"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    otp_hash = Column(String(64), nullable=False)

    attempts = Column(Integer, default=0, nullable=False)

    expires_at = Column(DateTime(timezone=True), nullable=False)

    last_sent_at = Column(DateTime(timezone=True), nullable=False)

    verified_at = Column(DateTime(timezone=True), nullable=True)

    used_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    __table_args__ = (
        Index("ix_password_reset_user_created", "user_id", "created_at"),
    )
