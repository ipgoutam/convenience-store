from sqlalchemy import (
    Column,
    Integer,
    ForeignKey,
    DateTime,
    func,
    UniqueConstraint
)

from app.database import Base


class ProductFrequentlyBoughtTogether(Base):
    __tablename__ = "product_frequently_bought_together"

    id = Column(Integer, primary_key=True, index=True)

    product_id = Column(
        Integer,
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    related_product_id = Column(
        Integer,
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    display_order = Column(Integer, nullable=False, default=0)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "product_id",
            "related_product_id",
            name="uq_product_fbt_pair"
        ),
    )