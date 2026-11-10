
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from decimal import Decimal, ROUND_HALF_UP, ROUND_CEILING, ROUND_DOWN
from uuid import uuid4
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import Optional

from app.database import get_db
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.product import Product
from app.models.user import User
from app.models.coupon import Coupon
from app.models.store_setting import StoreSetting
from app.models.address import Address
from app.models.cart import Cart, CartItem
from app.models.stock_notification_subscription import StockNotificationSubscription

from pydantic import BaseModel
from typing import Literal

from app.schemas.order import (
    OrderCreate,
    OrderResponse,
    OrderStatusUpdate
)

from app.routers.auth import get_current_user, require_section_access
from app.services.notification_service import create_notification
from app.models.inventory_movement import InventoryMovement

router = APIRouter(
    prefix="/orders",
    tags=["Orders"]
)


TWO_DECIMALS = Decimal("0.01")
QUANTITY_PRECISION = Decimal("0.000000000001")

class CouponValidationRequest(BaseModel):
    coupon_code: str
    delivery_type: Literal["pickup", "delivery"]

DISCRETE_UNITS = {"piece", "packet", "bottle"}
MEASUREMENT_UNITS = {"kg", "g", "litre", "ml"}


def notify_all_admins(
    db: Session,
    title: str,
    message: str,
    notification_type: str,
    order_id: int
):
    admins = db.query(User).filter(
        User.role.in_(["admin", "super_admin"]),
        User.is_active == True
    ).all()

    for admin in admins:
        create_notification(
            db=db,
            user_id=admin.id,
            title=title,
            message=message,
            notification_type=notification_type,
            order_id=order_id
        )

def notify_customers_product_back_in_stock(
    db: Session,
    product: Product
):
    """
    Notify customers who subscribed to this product's
    restock alert. Only notify each subscription once.
    """

    if product.stock <= 0 or not product.is_available:
        return 0

    subscriptions = db.query(
        StockNotificationSubscription
    ).filter(
        StockNotificationSubscription.product_id == product.id,
        StockNotificationSubscription.is_active == True,
        StockNotificationSubscription.notified_at.is_(None)
    ).all()

    notified_count = 0
    now = datetime.now(timezone.utc)

    for subscription in subscriptions:
        create_notification(
            db=db,
            user_id=subscription.user_id,
            title="Product back in stock!",
            message=(
                f"{product.name} is back in stock. "
                "Visit G-MART to order it."
            ),
            notification_type="product_restock"
        )

        subscription.notified_at = now
        notified_count += 1

    return notified_count


def get_discounted_unit_price(product: Product) -> Decimal:
    price = Decimal(str(product.price))
    discount = Decimal(str(product.discount_percentage or 0))

    return (
        price * (Decimal("1") - discount / Decimal("100"))
    ).quantize(
        TWO_DECIMALS,
        rounding=ROUND_HALF_UP
    )


def calculate_quantity_from_amount(
    amount: Decimal,
    unit_price: Decimal
) -> Decimal:
    if unit_price <= 0:
        raise HTTPException(
            status_code=400,
            detail="Amount-based purchasing is unavailable for this product"
        )

    quantity = (amount / unit_price).quantize(
        QUANTITY_PRECISION,
        rounding=ROUND_DOWN
    )

    if quantity <= 0:
        raise HTTPException(
            status_code=400,
            detail="Entered amount is too small to purchase this product"
        )

    return quantity


def validate_purchase_quantity(
    product: Product,
    quantity: Decimal
):
    unit = product.unit

    if unit in DISCRETE_UNITS:
        if quantity != quantity.to_integral_value():
            raise HTTPException(
                status_code=400,
                detail=f"{product.name} must be purchased in whole {unit} units"
            )

    elif unit not in MEASUREMENT_UNITS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported selling unit for {product.name}"
        )


def calculate_stock_deduction(quantity: Decimal) -> int:
    return int(
        quantity.to_integral_value(rounding=ROUND_CEILING)
    )


# CUSTOMER: Validate coupon and preview discount
@router.post("/validate-coupon")
def validate_coupon(
    request: CouponValidationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Validate coupon code
    normalized_code = request.coupon_code.strip().upper()

    if not normalized_code:
        raise HTTPException(
            status_code=400,
            detail="Please enter a coupon code"
        )

    coupon = db.query(Coupon).filter(
        Coupon.code == normalized_code
    ).first()

    if not coupon or not coupon.is_active:
        raise HTTPException(
            status_code=400,
            detail="Invalid or inactive coupon"
        )

    # Check coupon dates
    now = datetime.now(timezone.utc)

    start_date = coupon.start_date
    expiry_date = coupon.expiry_date

    if start_date.tzinfo is None:
        start_date = start_date.replace(tzinfo=timezone.utc)

    if expiry_date.tzinfo is None:
        expiry_date = expiry_date.replace(tzinfo=timezone.utc)

    if now < start_date or now >= expiry_date:
        raise HTTPException(
            status_code=400,
            detail="Coupon is not currently valid"
        )

    # Check usage limit
    if (
        coupon.max_uses is not None
        and coupon.usage_count >= coupon.max_uses
    ):
        raise HTTPException(
            status_code=400,
            detail="Coupon usage limit reached"
        )

    # Get customer's cart
    cart = db.query(Cart).filter(
        Cart.user_id == current_user.id
    ).first()

    if not cart:
        raise HTTPException(
            status_code=400,
            detail="Your cart is empty"
        )

    cart_items = db.query(CartItem).filter(
        CartItem.cart_id == cart.id
    ).all()

    if not cart_items:
        raise HTTPException(
            status_code=400,
            detail="Your cart is empty"
        )

    # Calculate subtotal using current product prices
    subtotal = Decimal("0.00")

    for cart_item in cart_items:
        product = db.query(Product).filter(
            Product.id == cart_item.product_id
        ).first()

        if not product or not product.is_available:
            raise HTTPException(
                status_code=400,
                detail="A product in your cart is unavailable"
            )

        unit_price = get_discounted_unit_price(product)

        if cart_item.purchase_mode == "amount":
            if cart_item.purchase_amount is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"Purchase amount is missing for {product.name}"
                )

            line_total = Decimal(
                str(cart_item.purchase_amount)
            )

        else:
            quantity = Decimal(str(cart_item.quantity))

            line_total = (
                unit_price * quantity
            ).quantize(
                TWO_DECIMALS,
                rounding=ROUND_HALF_UP
            )

        subtotal += line_total

    subtotal = subtotal.quantize(
        TWO_DECIMALS,
        rounding=ROUND_HALF_UP
    )

    # Check minimum order amount
    if subtotal < coupon.min_order_amount:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum order amount is ₹{coupon.min_order_amount}"
        )

    # Calculate coupon discount
    if coupon.discount_type == "percentage":
        coupon_discount = (
            subtotal
            * coupon.discount_value
            / Decimal("100")
        )

        if coupon.max_discount_amount is not None:
            coupon_discount = min(
                coupon_discount,
                coupon.max_discount_amount
            )

    else:
        coupon_discount = coupon.discount_value

    coupon_discount = min(
        coupon_discount,
        subtotal
    ).quantize(
        TWO_DECIMALS,
        rounding=ROUND_HALF_UP
    )

    # Calculate delivery fee
    store_settings = db.query(StoreSetting).first()

    if not store_settings:
        raise HTTPException(
            status_code=503,
            detail="Store settings are not configured"
        )

    if request.delivery_type == "delivery":
        delivery_fee = Decimal(
            str(store_settings.delivery_fee)
        ).quantize(TWO_DECIMALS)
    else:
        delivery_fee = Decimal("0.00")

    # Calculate estimated total
    total_amount = (
        subtotal + delivery_fee - coupon_discount
    ).quantize(
        TWO_DECIMALS,
        rounding=ROUND_HALF_UP
    )

    return {
        "valid": True,
        "message": "Coupon applied successfully",
        "coupon_code": coupon.code,
        "discount_type": coupon.discount_type,
        "discount_value": coupon.discount_value,
        "subtotal": subtotal,
        "delivery_fee": delivery_fee,
        "discount_amount": coupon_discount,
        "total_amount": total_amount
    }


# CUSTOMER: Place an order
@router.post(
    "/",
    response_model=OrderResponse,
    status_code=status.HTTP_201_CREATED
)
def create_order(
    order_data: OrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        # Store settings
        store_settings = db.query(StoreSetting).first()

        if not store_settings:
            raise HTTPException(
                status_code=503,
                detail="Store settings are not configured"
            )

        # Online payment availability
        if (
            order_data.payment_method == "online"
            and not store_settings.online_payment_enabled
        ):
            raise HTTPException(
                status_code=400,
                detail="Online payments are currently unavailable. Please choose Cash on Delivery."
            )

        # Store availability
        if not store_settings.is_open:
            raise HTTPException(
                status_code=400,
                detail="The store is currently closed"
            )

        current_time = datetime.now(
            ZoneInfo("Asia/Kolkata")
        ).time().replace(tzinfo=None)

        if not (
            store_settings.opening_time
            <= current_time
            < store_settings.closing_time
        ):
            raise HTTPException(
                status_code=400,
                detail="Orders can only be placed during store operating hours"
            )

        # Delivery address validation
        delivery_address_snapshot = None
        order_phone = order_data.customer_phone

        if order_data.delivery_type == "delivery":

            if order_data.address_id is not None:
                saved_address = db.query(Address).filter(
                    Address.id == order_data.address_id,
                    Address.user_id == current_user.id
                ).first()

                if not saved_address:
                    raise HTTPException(
                        status_code=404,
                        detail="Saved address not found"
                    )

                order_phone = saved_address.phone

                delivery_address_snapshot = (
                    f"{saved_address.recipient_name}, "
                    f"{saved_address.address_line}, "
                    f"{saved_address.landmark + ', ' if saved_address.landmark else ''}"
                    f"{saved_address.city}, "
                    f"{saved_address.state} - "
                    f"{saved_address.pincode}"
                )

            elif order_data.delivery_address:
                delivery_address_snapshot = (
                    order_data.delivery_address.strip()
                )

            else:
                raise HTTPException(
                    status_code=400,
                    detail="Delivery address is required"
                )

            if not order_phone or not order_phone.strip():
                raise HTTPException(
                    status_code=400,
                    detail="Customer phone number is required"
                )

            order_phone = order_phone.strip()

            if not order_phone.isdigit() or len(order_phone) != 10:
                raise HTTPException(
                    status_code=400,
                    detail="Phone number must contain exactly 10 digits"
                )

        # Get and lock customer's cart
        cart = (
            db.query(Cart)
            .filter(Cart.user_id == current_user.id)
            .with_for_update()
            .first()
        )

        if not cart:
            raise HTTPException(
                status_code=400,
                detail="Your cart is empty"
            )

        cart_items = (
            db.query(CartItem)
            .filter(CartItem.cart_id == cart.id)
            .with_for_update()
            .all()
        )

        if not cart_items:
            raise HTTPException(
                status_code=400,
                detail="Your cart is empty"
            )

        subtotal = Decimal("0.00")
        order_items = []

        # Validate products and calculate order totals
        for cart_item in cart_items:

            product = (
                db.query(Product)
                .filter(Product.id == cart_item.product_id)
                .with_for_update()
                .first()
            )

            if not product:
                raise HTTPException(
                    status_code=404,
                    detail=f"Product ID {cart_item.product_id} not found"
                )

            if not product.is_available:
                raise HTTPException(
                    status_code=400,
                    detail=f"{product.name} is unavailable"
                )
            if (
                product.expiry_date is not None
                and product.expiry_date < datetime.now(
                    ZoneInfo("Asia/Kolkata")
                ).date()
            ):
                raise HTTPException(
                    status_code=400,
                    detail=f"{product.name} has expired and cannot be purchased"
                )
            

            unit_price = get_discounted_unit_price(product)

            purchase_mode = cart_item.purchase_mode or "quantity"
            purchase_amount = cart_item.purchase_amount

            # Recalculate quantity using the current price
            if purchase_mode == "amount":

                if product.unit not in MEASUREMENT_UNITS:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Amount-based purchasing is not supported for {product.name}"
                    )

                if purchase_amount is None:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Purchase amount is missing for {product.name}"
                    )

                purchase_amount = Decimal(str(purchase_amount))

                quantity = calculate_quantity_from_amount(
                    purchase_amount,
                    unit_price
                )

                line_total = purchase_amount

            elif purchase_mode == "quantity":

                quantity = Decimal(str(cart_item.quantity))

                if quantity <= 0:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid quantity for {product.name}"
                    )

                line_total = (
                    unit_price * quantity
                ).quantize(
                    TWO_DECIMALS,
                    rounding=ROUND_HALF_UP
                )

            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid purchase mode for {product.name}"
                )

            validate_purchase_quantity(product, quantity)

            # Calculate whole-unit stock deduction
            stock_deduction = calculate_stock_deduction(quantity)

            if product.stock < stock_deduction:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for {product.name}. Available stock: {product.stock} {product.unit}"
                )

            # Calculate total
            subtotal += line_total

            # Record stock before deduction
            previous_stock = product.stock

            # Deduct stock
            product.stock -= stock_deduction

            # Save stock movement details for this order
            order_items.append({
                "product": product,
                "product_name": product.name,
                "unit": product.unit,
                "unit_price": unit_price,
                "quantity": quantity,
                "stock_deduction_quantity": stock_deduction,
                "purchase_mode": purchase_mode,
                "purchase_amount": purchase_amount,
                "line_total": line_total,
                "previous_stock": previous_stock,
                "new_stock": product.stock
            })

        subtotal = subtotal.quantize(
            TWO_DECIMALS,
            rounding=ROUND_HALF_UP
        )

        # Delivery fee
        if order_data.delivery_type == "delivery":
            delivery_fee = Decimal(
                str(store_settings.delivery_fee)
            ).quantize(TWO_DECIMALS)
        else:
            delivery_fee = Decimal("0.00")

        # Coupon validation
        coupon = None
        coupon_discount = Decimal("0.00")
        coupon_code = None

        if order_data.coupon_code:

            normalized_code = (
                order_data.coupon_code.strip().upper()
            )

            coupon = (
                db.query(Coupon)
                .filter(Coupon.code == normalized_code)
                .with_for_update()
                .first()
            )

            if not coupon or not coupon.is_active:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid or inactive coupon"
                )

            now = datetime.now(timezone.utc)

            start_date = coupon.start_date
            expiry_date = coupon.expiry_date

            if start_date.tzinfo is None:
                start_date = start_date.replace(
                    tzinfo=timezone.utc
                )

            if expiry_date.tzinfo is None:
                expiry_date = expiry_date.replace(
                    tzinfo=timezone.utc
                )

            if now < start_date or now >= expiry_date:
                raise HTTPException(
                    status_code=400,
                    detail="Coupon is not currently valid"
                )

            if (
                coupon.max_uses is not None
                and coupon.usage_count >= coupon.max_uses
            ):
                raise HTTPException(
                    status_code=400,
                    detail="Coupon usage limit reached"
                )

            if subtotal < coupon.min_order_amount:
                raise HTTPException(
                    status_code=400,
                    detail="Minimum order amount not reached"
                )

            if coupon.discount_type == "percentage":

                coupon_discount = (
                    subtotal
                    * coupon.discount_value
                    / Decimal("100")
                )

                if coupon.max_discount_amount is not None:
                    coupon_discount = min(
                        coupon_discount,
                        coupon.max_discount_amount
                    )

            else:
                coupon_discount = coupon.discount_value

            coupon_discount = min(
                coupon_discount,
                subtotal
            ).quantize(
                TWO_DECIMALS,
                rounding=ROUND_HALF_UP
            )

            coupon_code = coupon.code

        # Final amount
        total_amount = (
            subtotal + delivery_fee - coupon_discount
        ).quantize(
            TWO_DECIMALS,
            rounding=ROUND_HALF_UP
        )

        if total_amount < Decimal("0.00"):
            raise HTTPException(
                status_code=400,
                detail="Invalid order total"
            )

        # Record coupon usage
        if coupon:
            coupon.usage_count += 1

        # Create order
        new_order = Order(
            order_number=str(uuid4()),
            customer_id=current_user.id,
            delivery_type=order_data.delivery_type,
            delivery_address=delivery_address_snapshot,
            customer_phone=order_phone,
            notes=order_data.notes,
            subtotal=subtotal,
            delivery_fee=delivery_fee,
            coupon_code=coupon_code,
            discount_amount=coupon_discount,
            total_amount=total_amount,
            payment_method=order_data.payment_method,
            payment_status="pending",
            order_status="pending"
        )

        db.add(new_order)
        db.flush()

        # Record stock movements for this order
        for item in order_items:
            movement = InventoryMovement(
                product_id=item["product"].id,
                product_name=item["product_name"],
                quantity_change=-item["stock_deduction_quantity"],
                previous_stock=item["previous_stock"],
                new_stock=item["new_stock"],
                movement_type="sale",
                reason=f"Customer order: {new_order.order_number}",
                changed_by_user_id=current_user.id,
                order_id=new_order.id
            )

            db.add(movement)

        # Save order items
        for item in order_items:

            order_item = OrderItem(
                order_id=new_order.id,
                product_id=item["product"].id,
                product_name=item["product_name"],
                unit=item["unit"],
                unit_price=item["unit_price"],
                quantity=item["quantity"],
                stock_deduction_quantity=item[
                    "stock_deduction_quantity"
                ],
                purchase_mode=item["purchase_mode"],
                purchase_amount=item["purchase_amount"],
                line_total=item["line_total"]
            )

            db.add(order_item)

        # Clear cart within the same transaction
        db.query(CartItem).filter(
            CartItem.cart_id == cart.id
        ).delete(synchronize_session=False)

        # Customer notification
        create_notification(
            db=db,
            user_id=current_user.id,
            title="Order placed successfully",
            message=f"Your order #{new_order.order_number} has been placed successfully.",
            notification_type="order_placed",
            order_id=new_order.id
        )

        # Admin notifications
        notify_all_admins(
            db=db,
            title="New order received!",
            message=f"{current_user.full_name} placed order #{new_order.order_number}.",
            notification_type="new_order",
            order_id=new_order.id
        )

        db.commit()
        db.refresh(new_order)

        return new_order

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not create order"
        )


# ADMIN: Search orders
@router.get("/admin/search", response_model=list[OrderResponse])
def search_orders(
    keyword: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("orders"))
):
    keyword = keyword.strip()

    if not keyword:
        raise HTTPException(
            status_code=400,
            detail="Search keyword cannot be empty"
        )

    filters = [
        Order.order_number.ilike(f"%{keyword}%"),
        Order.customer_phone.ilike(f"%{keyword}%")
    ]

    if keyword.isdigit():
        filters.append(Order.customer_id == int(keyword))

    return db.query(Order).filter(
        or_(*filters)
    ).order_by(
        Order.created_at.desc()
    ).limit(100).all()


# CUSTOMER: Own order summary
@router.get("/my-orders/summary")
def get_my_order_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    customer_orders = db.query(Order).filter(
        Order.customer_id == current_user.id
    )

    return {
        "total_orders": customer_orders.count(),
        "pending_orders": customer_orders.filter(
            Order.order_status == "pending"
        ).count(),
        "active_orders": customer_orders.filter(
            Order.order_status.in_([
                "confirmed",
                "preparing",
                "ready_for_pickup",
                "out_for_delivery"
            ])
        ).count(),
        "completed_orders": customer_orders.filter(
            Order.order_status == "completed"
        ).count(),
        "cancelled_orders": customer_orders.filter(
            Order.order_status == "cancelled"
        ).count()
    }


# CUSTOMER: View own orders
@router.get("/my-orders", response_model=list[OrderResponse])
def get_my_orders(
    skip: int = 0,
    limit: int = 10,
    order_status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if skip < 0:
        raise HTTPException(
            status_code=400,
            detail="Skip cannot be negative"
        )

    if limit < 1 or limit > 100:
        raise HTTPException(
            status_code=400,
            detail="Limit must be between 1 and 100"
        )

    query = db.query(Order).filter(
        Order.customer_id == current_user.id
    )

    if order_status:
        allowed_statuses = [
            "pending",
            "confirmed",
            "preparing",
            "ready_for_pickup",
            "out_for_delivery",
            "completed",
            "cancelled"
        ]

        if order_status not in allowed_statuses:
            raise HTTPException(
                status_code=400,
                detail="Invalid order status"
            )

        query = query.filter(
            Order.order_status == order_status
        )

    return query.order_by(
        Order.created_at.desc()
    ).offset(skip).limit(limit).all()


# ADMIN: View all orders
@router.get("/admin/all", response_model=list[OrderResponse])
def get_all_orders(
    skip: int = 0,
    limit: int = 10,
    order_status: Optional[str] = None,
    payment_status: Optional[str] = None,
    delivery_type: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("orders"))
):
    if skip < 0:
        raise HTTPException(
            status_code=400,
            detail="Skip cannot be negative"
        )

    if limit < 1 or limit > 100:
        raise HTTPException(
            status_code=400,
            detail="Limit must be between 1 and 100"
        )

    query = db.query(Order)

    if order_status:
        allowed_statuses = [
            "pending",
            "confirmed",
            "preparing",
            "ready_for_pickup",
            "out_for_delivery",
            "completed",
            "cancelled"
        ]

        if order_status not in allowed_statuses:
            raise HTTPException(
                status_code=400,
                detail="Invalid order status"
            )

        query = query.filter(
            Order.order_status == order_status
        )

    if payment_status:
        allowed_payments = [
            "pending",
            "paid",
            "failed",
            "refunded"
        ]

        if payment_status not in allowed_payments:
            raise HTTPException(
                status_code=400,
                detail="Invalid payment status"
            )

        query = query.filter(
            Order.payment_status == payment_status
        )

    if delivery_type:
        if delivery_type not in ["pickup", "delivery"]:
            raise HTTPException(
                status_code=400,
                detail="Invalid delivery type"
            )

        query = query.filter(
            Order.delivery_type == delivery_type
        )

    return query.order_by(
        Order.created_at.desc()
    ).offset(skip).limit(limit).all()



def restore_order_stock(
    db: Session,
    order: Order,
    actor_user_id: int,
    reason: str
):
    for item in order.items:

        if item.product_id is None:
            continue

        product = (
            db.query(Product)
            .filter(Product.id == item.product_id)
            .with_for_update()
            .first()
        )

        if product:
            deduction = item.stock_deduction_quantity

            # Fallback for older order records
            if deduction is None:
                deduction = int(
                    Decimal(str(item.quantity)).to_integral_value(
                        rounding=ROUND_CEILING
                    )
                )

            previous_stock = product.stock

            # Restore product stock
            product.stock += deduction

            movement = InventoryMovement(
                product_id=product.id,
                product_name=product.name,
                quantity_change=deduction,
                previous_stock=previous_stock,
                new_stock=product.stock,
                movement_type="cancellation",
                reason=reason,
                changed_by_user_id=actor_user_id,
                order_id=order.id
            )

            db.add(movement)

            # Notify customers if stock has returned
            if previous_stock <= 0 and product.stock > 0:
                notify_customers_product_back_in_stock(
                    db,
                    product
                )


# CUSTOMER: Cancel own pending order
@router.patch("/{order_id}/cancel", response_model=OrderResponse)
def cancel_my_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    order = (
        db.query(Order)
        .filter(
            Order.id == order_id,
            Order.customer_id == current_user.id
        )
        .with_for_update()
        .first()
    )

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )

    if order.order_status != "pending":
        raise HTTPException(
            status_code=400,
            detail="Only pending orders can be cancelled"
        )

    if order.payment_status == "paid":
        raise HTTPException(
            status_code=400,
            detail="Paid orders must be refunded before cancellation"
        )

    try:
        restore_order_stock(
            db,
            order,
            current_user.id,
            "Order cancelled by customer"
        )

        order.order_status = "cancelled"

        create_notification(
            db=db,
            user_id=current_user.id,
            title="Order cancelled",
            message=f"Your order #{order.order_number} has been cancelled.",
            notification_type="order_cancelled",
            order_id=order.id
        )

        notify_all_admins(
            db=db,
            title="Order cancellation",
            message=f"Customer cancelled order #{order.order_number}.",
            notification_type="order_cancelled",
            order_id=order.id
        )

        db.commit()
        db.refresh(order)

        return order

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not cancel order"
        )


# ADMIN: Update order status
@router.patch("/{order_id}/status", response_model=OrderResponse)
def update_order_status(
    order_id: int,
    status_data: OrderStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("orders"))
):
    order = (
        db.query(Order)
        .filter(Order.id == order_id)
        .with_for_update()
        .first()
    )

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )

    allowed_transitions = {
        "pending": ["confirmed", "cancelled"],
        "confirmed": ["preparing", "cancelled"],
        "preparing": [
            "ready_for_pickup",
            "out_for_delivery",
            "cancelled"
        ],
        "ready_for_pickup": ["completed", "cancelled"],
        "out_for_delivery": ["completed"]
    }

    new_status = status_data.order_status
    current_status = order.order_status

    if new_status not in allowed_transitions.get(
        current_status, []
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot change order status from {current_status} to {new_status}"
        )

    if (
        new_status == "ready_for_pickup"
        and order.delivery_type != "pickup"
    ):
        raise HTTPException(
            status_code=400,
            detail="Only pickup orders can be marked ready for pickup"
        )

    if (
        new_status == "out_for_delivery"
        and order.delivery_type != "delivery"
    ):
        raise HTTPException(
            status_code=400,
            detail="Only delivery orders can be marked out for delivery"
        )

    if (
        new_status == "cancelled"
        and order.payment_status == "paid"
    ):
        raise HTTPException(
            status_code=400,
            detail="Refund the payment before cancelling this order"
        )

    # Prevent completing COD delivery before cash collection
    if (
        new_status == "completed"
        and order.delivery_type == "delivery"
        and order.payment_method == "cash"
        and order.payment_status != "paid"
    ):
        raise HTTPException(
            status_code=400,
            detail="Please mark COD payment as collected before completing delivery"
        )

    try:
        if new_status == "cancelled":
            restore_order_stock(
                db,
                order,
                admin.id,
                "Order cancelled by admin"
            )

        order.order_status = new_status

        status_messages = {
            "confirmed": "Your order has been confirmed.",
            "preparing": "Your order is being prepared.",
            "ready_for_pickup": "Your order is ready for pickup.",
            "out_for_delivery": "Your order is out for delivery.",
            "completed": "Your order has been completed.",
            "cancelled": "Your order has been cancelled by the store."
        }

        create_notification(
            db=db,
            user_id=order.customer_id,
            title=f"Order {new_status.replace('_', ' ').title()}",
            message=status_messages.get(
                new_status,
                f"Your order status is now {new_status}."
            ),
            notification_type=f"order_{new_status}",
            order_id=order.id
        )

        db.commit()
        db.refresh(order)

        return order

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not update order status"
        )



# ADMIN: Mark Cash on Delivery payment as collected
@router.patch(
    "/{order_id}/collect-cod",
    response_model=OrderResponse
)
def collect_cod_payment(
    order_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("orders"))
):
    order = (
        db.query(Order)
        .filter(Order.id == order_id)
        .with_for_update()
        .first()
    )

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )

    if order.payment_method != "cash":
        raise HTTPException(
            status_code=400,
            detail="This order is not a Cash on Delivery order"
        )

    if order.delivery_type != "delivery":
        raise HTTPException(
            status_code=400,
            detail="COD collection is only available for delivery orders"
        )

    if order.order_status not in ["out_for_delivery", "completed"]:
        raise HTTPException(
            status_code=400,
            detail="Cash can only be collected when the order is out for delivery or completed"
        )

    if order.payment_status == "paid":
        raise HTTPException(
            status_code=400,
            detail="Payment has already been collected"
        )

    if order.payment_status != "pending":
        raise HTTPException(
            status_code=400,
            detail="This order cannot be marked as paid"
        )

    try:
        order.payment_status = "paid"

        create_notification(
            db=db,
            user_id=order.customer_id,
            title="COD payment received",
            message=(
                f"Cash payment of ₹{order.total_amount} "
                f"for order #{order.order_number} has been received."
            ),
            notification_type="payment_received",
            order_id=order.id
        )

        db.commit()
        db.refresh(order)

        return order

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not record COD payment"
        )

# ADMIN: Order summary
@router.get("/admin/summary")
def get_order_summary(
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("orders"))
):
    total_orders = db.query(Order).count()

    pending_orders = db.query(Order).filter(
        Order.order_status == "pending"
    ).count()

    confirmed_orders = db.query(Order).filter(
        Order.order_status == "confirmed"
    ).count()

    preparing_orders = db.query(Order).filter(
        Order.order_status == "preparing"
    ).count()

    completed_orders = db.query(Order).filter(
        Order.order_status == "completed"
    ).count()

    cancelled_orders = db.query(Order).filter(
        Order.order_status == "cancelled"
    ).count()

    total_revenue = db.query(
        func.coalesce(
            func.sum(Order.total_amount),
            0
        )
    ).filter(
        Order.payment_status == "paid"
    ).scalar()

    return {
        "total_orders": total_orders,
        "pending_orders": pending_orders,
        "confirmed_orders": confirmed_orders,
        "preparing_orders": preparing_orders,
        "completed_orders": completed_orders,
        "cancelled_orders": cancelled_orders,
        "total_revenue": total_revenue
    }


# ADMIN: View one order
@router.get("/admin/{order_id}", response_model=OrderResponse)
def get_admin_order(
    order_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("orders"))
):
    order = db.query(Order).filter(
        Order.id == order_id
    ).first()

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )

    return order


# CUSTOMER: View one of their own orders
@router.get("/{order_id}", response_model=OrderResponse)
def get_my_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    order = (
        db.query(Order)
        .filter(
            Order.id == order_id,
            Order.customer_id == current_user.id
        )
        .first()
    )

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )

    return order
