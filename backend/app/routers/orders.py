
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy import or_
from decimal import Decimal, ROUND_HALF_UP
from uuid import uuid4

from app.database import get_db
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.product import Product
from app.models.user import User
from app.models.coupon import Coupon
from app.schemas.order import OrderCreate, OrderResponse, OrderStatusUpdate, PaymentStatusUpdate
from app.routers.auth import get_current_user, require_admin
from app.models.store_setting import StoreSetting
from typing import Optional
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo
from app.models.address import Address

router = APIRouter(
    prefix="/orders",
    tags=["Orders"]
)


# CUSTOMER: Place an order
@router.post("/", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
def create_order(
    order_data: OrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        # Get store settings for delivery fee
        store_settings = db.query(StoreSetting).first()

        if not store_settings:
            raise HTTPException(
                status_code=503,
                detail="Store settings are not configured"
            )



        # Check whether the store is manually closed
        if not store_settings.is_open:
            raise HTTPException(
                status_code=400,
                detail="The store is currently closed"
            )

        # Check store operating hours (Indian Standard Time)
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

        
        # Validate delivery address
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

            elif order_data.delivery_address and order_data.delivery_address.strip():

                delivery_address_snapshot = order_data.delivery_address.strip()

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

        subtotal = Decimal("0.00")
        order_items = []

        # Check products and calculate totals
        for item in order_data.items:

            product = (
                db.query(Product)
                .filter(Product.id == item.product_id)
                .with_for_update()
                .first()
            )

            if not product:
                raise HTTPException(
                    status_code=404,
                    detail=f"Product ID {item.product_id} not found"
                )

            if not product.is_available:
                raise HTTPException(
                    status_code=400,
                    detail=f"{product.name} is unavailable"
                )

            if product.stock < item.quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for {product.name}"
                )

            # Calculate discounted price
            original_price = Decimal(str(product.price))
            discount = Decimal(str(product.discount_percentage or 0))

            unit_price = (
                original_price * (
                    Decimal("1") - discount / Decimal("100")
                )
            ).quantize(
                Decimal("0.01"),
                rounding=ROUND_HALF_UP
            )

            line_total = (
                unit_price * item.quantity
            ).quantize(
                Decimal("0.01"),
                rounding=ROUND_HALF_UP
            )

            subtotal += line_total

            order_items.append({
                "product": product,
                "product_name": product.name,
                "unit_price": unit_price,
                "quantity": item.quantity,
                "line_total": line_total
            })

            # Deduct stock
            product.stock -= item.quantity

        # Calculate delivery fee
        if order_data.delivery_type == "delivery":
            delivery_fee = Decimal(str(store_settings.delivery_fee))
        else:
            delivery_fee = Decimal("0.00")



        #dsbdagshdsgdj
        # Calculate coupon discount
        coupon = None
        coupon_discount = Decimal("0.00")
        coupon_code = None

        if order_data.coupon_code:

            normalized_code = order_data.coupon_code.strip().upper()

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
                start_date = start_date.replace(tzinfo=timezone.utc)

            if expiry_date.tzinfo is None:
                expiry_date = expiry_date.replace(tzinfo=timezone.utc)

            if now < start_date or now > expiry_date:
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
                    subtotal * coupon.discount_value / Decimal("100")
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
                Decimal("0.01"),
                rounding=ROUND_HALF_UP
            )

            coupon_code = coupon.code

        # Calculate final order amount
        total_amount = subtotal + delivery_fee - coupon_discount

        # Record successful coupon usage
        if coupon:
            coupon.usage_count += 1


        

        # Create main order
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

        # Save individual order items
        for item in order_items:
            order_item = OrderItem(
                order_id=new_order.id,
                product_id=item["product"].id,
                product_name=item["product_name"],
                unit_price=item["unit_price"],
                quantity=item["quantity"],
                line_total=item["line_total"]
            )

            db.add(order_item)

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



@router.get("/admin/search", response_model=list[OrderResponse])
def search_orders(
    keyword: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    keyword = keyword.strip()

    if not keyword:
        raise HTTPException(
            status_code=400,
            detail="Search keyword cannot be empty"
        )

    query = db.query(Order)

    filters = [
        Order.order_number.ilike(f"%{keyword}%"),
        Order.customer_phone.ilike(f"%{keyword}%")
    ]

    if keyword.isdigit():
        filters.append(Order.customer_id == int(keyword))

    orders = query.filter(
        or_(*filters)
    ).order_by(
        Order.created_at.desc()
    ).limit(100).all()

    return orders



@router.get("/my-orders/summary")
def get_my_order_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    customer_orders = db.query(Order).filter(
        Order.customer_id == current_user.id
    )

    total_orders = customer_orders.count()

    pending_orders = customer_orders.filter(
        Order.order_status == "pending"
    ).count()

    active_orders = customer_orders.filter(
        Order.order_status.in_([
            "confirmed",
            "preparing",
            "ready_for_pickup",
            "out_for_delivery"
        ])
    ).count()

    completed_orders = customer_orders.filter(
        Order.order_status == "completed"
    ).count()

    cancelled_orders = customer_orders.filter(
        Order.order_status == "cancelled"
    ).count()

    return {
        "total_orders": total_orders,
        "pending_orders": pending_orders,
        "active_orders": active_orders,
        "completed_orders": completed_orders,
        "cancelled_orders": cancelled_orders
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
        raise HTTPException(status_code=400, detail="Skip cannot be negative")

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

        query = query.filter(Order.order_status == order_status)

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
    admin: User = Depends(require_admin)
):
    if skip < 0:
        raise HTTPException(status_code=400, detail="Skip cannot be negative")

    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="Limit must be between 1 and 100")

    query = db.query(Order)

    if order_status:
        allowed_statuses = [
            "pending", "confirmed", "preparing",
            "ready_for_pickup", "out_for_delivery",
            "completed", "cancelled"
        ]
        if order_status not in allowed_statuses:
            raise HTTPException(status_code=400, detail="Invalid order status")
        query = query.filter(Order.order_status == order_status)

    if payment_status:
        allowed_payments = ["pending", "paid", "failed", "refunded"]
        if payment_status not in allowed_payments:
            raise HTTPException(status_code=400, detail="Invalid payment status")
        query = query.filter(Order.payment_status == payment_status)

    if delivery_type:
        if delivery_type not in ["pickup", "delivery"]:
            raise HTTPException(status_code=400, detail="Invalid delivery type")
        query = query.filter(Order.delivery_type == delivery_type)

    return query.order_by(
        Order.created_at.desc()
    ).offset(skip).limit(limit).all()



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
        # Restore product stock
        for item in order.items:
            if item.product_id is not None:
                product = (
                    db.query(Product)
                    .filter(Product.id == item.product_id)
                    .with_for_update()
                    .first()
                )

                if product:
                    product.stock += item.quantity

        order.order_status = "cancelled"

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
    admin: User = Depends(require_admin)
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
        "preparing": ["ready_for_pickup", "out_for_delivery", "cancelled"],
        "ready_for_pickup": ["completed", "cancelled"],
        "out_for_delivery": ["completed"]
    }

    new_status = status_data.order_status
    current_status = order.order_status

    if new_status not in allowed_transitions.get(current_status, []):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot change order status from {current_status} to {new_status}"
        )

    # Validate delivery-specific statuses
    if new_status == "ready_for_pickup" and order.delivery_type != "pickup":
        raise HTTPException(
            status_code=400,
            detail="Only pickup orders can be marked ready for pickup"
        )

    if new_status == "out_for_delivery" and order.delivery_type != "delivery":
        raise HTTPException(
            status_code=400,
            detail="Only delivery orders can be marked out for delivery"
        )

    # Paid orders must be refunded before cancellation
    if new_status == "cancelled" and order.payment_status == "paid":
        raise HTTPException(
            status_code=400,
            detail="Refund the payment before cancelling this order"
        )

    try:
        # Restore stock when admin cancels an order
        if new_status == "cancelled":
            for item in order.items:
                if item.product_id is not None:
                    product = (
                        db.query(Product)
                        .filter(Product.id == item.product_id)
                        .with_for_update()
                        .first()
                    )

                    if product:
                        product.stock += item.quantity

        order.order_status = new_status

        db.commit()
        db.refresh(order)

        return order

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not update order status"
        )



@router.get("/admin/summary")
def get_order_summary(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
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
        func.coalesce(func.sum(Order.total_amount), 0)
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


@router.get("/admin/{order_id}", response_model=OrderResponse)
def get_admin_order(
    order_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
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
        raise HTTPException(status_code=404, detail="Order not found")

    return order



# ADMIN: Update payment status
@router.patch("/{order_id}/payment", response_model=OrderResponse)
def update_payment_status(
    order_id: int,
    payment_data: PaymentStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
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

    new_status = payment_data.payment_status
    current_status = order.payment_status

    # Allow only valid payment status transitions
    allowed_transitions = {
        "pending": ["paid", "failed"],
        "failed": ["paid"],
        "paid": ["refunded"],
        "refunded": []
    }

    # Prevent unnecessary or invalid status changes
    if new_status == current_status:
        return order

    if new_status not in allowed_transitions.get(current_status, []):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot change payment status from {current_status} to {new_status}"
        )

    # A cancelled order cannot receive a payment
    if order.order_status == "cancelled" and new_status == "paid":
        raise HTTPException(
            status_code=400,
            detail="Cannot mark a cancelled order as paid"
        )

    try:
        order.payment_status = new_status

        db.commit()
        db.refresh(order)

        return order

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not update payment status"
        )

