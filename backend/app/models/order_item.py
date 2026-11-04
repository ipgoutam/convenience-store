
from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    Numeric
)
from sqlalchemy.orm import relationship

from app.database import Base


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    order_id = Column(
        Integer,
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    product_id = Column(
        Integer,
        ForeignKey("products.id", ondelete="SET NULL"),
        nullable=True
    )

    # Product details saved at the time of ordering
    product_name = Column(
        String(150),
        nullable=False
    )

    unit = Column(
        String(20),
        nullable=False,
        default="piece"
    )

    unit_price = Column(
        Numeric(10, 2),
        nullable=False
    )

    # Exact quantity purchased
    quantity = Column(
        Numeric(18, 12),
        nullable=False
    )

    # Actual whole stock units deducted
    stock_deduction_quantity = Column(
        Integer,
        nullable=False
    )

    # How the customer purchased the product
    purchase_mode = Column(
        String(20),
        nullable=False,
        default="quantity"
    )

    # Exact customer-entered amount for amount-based purchases
    purchase_amount = Column(
        Numeric(10, 2),
        nullable=True
    )

    line_total = Column(
        Numeric(10, 2),
        nullable=False
    )

    # Relationship with Order
    order = relationship(
        "Order",
        back_populates="items"
    )
