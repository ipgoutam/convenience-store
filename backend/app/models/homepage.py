
from sqlalchemy import (
    Column,
    Integer,
    Boolean,
    ForeignKey,
    DateTime,
    func,
    UniqueConstraint
)

from app.database import Base


class HomepageHeroProduct(Base):
    __tablename__ = "homepage_hero_products"

    id = Column(Integer, primary_key=True, index=True)

    product_id = Column(
        Integer,
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    display_order = Column(
        Integer,
        default=0,
        nullable=False
    )

    is_visible = Column(
        Boolean,
        default=True,
        nullable=False
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "product_id",
            name="uq_homepage_hero_product"
        ),
    )
