from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    ForeignKey,
    DateTime,
    func,
    UniqueConstraint,
    CheckConstraint
)

from app.database import Base


class ProductReview(Base):
    __tablename__ = "product_reviews"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    product_id = Column(
        Integer,
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    rating = Column(Integer, nullable=False)

    review_text = Column(Text, nullable=True)

    # pending, approved, rejected, hidden
    status = Column(
        String(20),
        nullable=False,
        default="pending",
        index=True
    )

    moderated_by = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )

    moderated_at = Column(
        DateTime(timezone=True),
        nullable=True
    )

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
        UniqueConstraint(
            "user_id",
            "product_id",
            name="uq_review_user_product"
        ),
        CheckConstraint(
            "rating >= 1 AND rating <= 5",
            name="ck_product_review_rating"
        ),
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'hidden')",
            name="ck_product_review_status"
        ),
    )