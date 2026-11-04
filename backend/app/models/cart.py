from sqlalchemy import (
    Column,
    Integer,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    Numeric,
    String,
    func
)
from sqlalchemy.orm import relationship

from app.database import Base


class Cart(Base):
    __tablename__ = "carts"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )

    items = relationship(
        "CartItem",
        back_populates="cart",
        cascade="all, delete-orphan"
    )


class CartItem(Base):
    __tablename__ = "cart_items"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    cart_id = Column(
        Integer,
        ForeignKey("carts.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    product_id = Column(
        Integer,
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False
    )

    # Actual product quantity, including fractional quantities.
    quantity = Column(
        Numeric(18, 12),
        nullable=False,
        default=1
    )

    # Customer can purchase by quantity or by amount.
    purchase_mode = Column(
        String(20),
        nullable=False,
        default="quantity"
    )

    # Preserves the exact amount entered in amount-based purchases.
    # Remains NULL for quantity-based purchases.
    purchase_amount = Column(
        Numeric(10, 2),
        nullable=True
    )

    product = relationship("Product")

    cart = relationship(
        "Cart",
        back_populates="items"
    )

    __table_args__ = (
        UniqueConstraint(
            "cart_id",
            "product_id",
            name="unique_cart_product"
        ),
    )