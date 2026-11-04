
from datetime import datetime, date, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo
from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.product import Product
from app.models.payment import Payment
from app.models.user import User
from app.routers.auth import require_admin


router = APIRouter(
    prefix="/admin/dashboard",
    tags=["Admin Dashboard"]
)

IST = ZoneInfo("Asia/Kolkata")


def get_today_range():
    today = datetime.now(IST).date()

    start = datetime.combine(
        today,
        time.min,
        tzinfo=IST
    )

    end = start + timedelta(days=1)

    return today, start, end


def get_sales_orders(db: Session, start_date=None):
    query = db.query(Order).filter(
        Order.payment_status == "paid",
        Order.order_status != "cancelled"
    )

    if start_date:
        query = query.filter(Order.created_at >= start_date)

    return query.all()


def decimal_to_float(value):
    return float(value or 0)


# --------------------------------------------------
# 1. MAIN DASHBOARD SUMMARY
# --------------------------------------------------

@router.get("/summary")
def dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    today, start, end = get_today_range()

    total_orders = db.query(
        func.count(Order.id)
    ).scalar() or 0

    today_orders = db.query(
        func.count(Order.id)
    ).filter(
        Order.created_at >= start,
        Order.created_at < end
    ).scalar() or 0

    pending_orders = db.query(
        func.count(Order.id)
    ).filter(
        Order.order_status == "pending"
    ).scalar() or 0

    completed_orders = db.query(
        func.count(Order.id)
    ).filter(
        Order.order_status == "completed"
    ).scalar() or 0

    cancelled_orders = db.query(
        func.count(Order.id)
    ).filter(
        Order.order_status == "cancelled"
    ).scalar() or 0

    total_customers = db.query(
        func.count(User.id)
    ).filter(
        User.role == "customer"
    ).scalar() or 0

    revenue = db.query(
        func.coalesce(func.sum(Order.total_amount), 0)
    ).filter(
        Order.payment_status == "paid",
        Order.order_status != "cancelled"
    ).scalar()

    today_revenue = db.query(
        func.coalesce(func.sum(Order.total_amount), 0)
    ).filter(
        Order.payment_status == "paid",
        Order.order_status != "cancelled",
        Order.created_at >= start,
        Order.created_at < end
    ).scalar()

    total_products = db.query(
        func.count(Product.id)
    ).scalar() or 0

    low_stock_products = db.query(
        func.count(Product.id)
    ).filter(
        Product.stock <= 5
    ).scalar() or 0

    return {
        "total_orders": total_orders,
        "today_orders": today_orders,
        "pending_orders": pending_orders,
        "completed_orders": completed_orders,
        "cancelled_orders": cancelled_orders,
        "total_customers": total_customers,
        "total_products": total_products,
        "low_stock_products": low_stock_products,
        "total_revenue": decimal_to_float(revenue),
        "today_revenue": decimal_to_float(today_revenue)
    }


# --------------------------------------------------
# 2. DAILY SALES - LAST 7 DAYS
# --------------------------------------------------

@router.get("/daily-sales")
def daily_sales(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    today = datetime.now(IST).date()
    start_date = today - timedelta(days=6)

    orders = get_sales_orders(
        db,
        datetime.combine(
            start_date,
            time.min,
            tzinfo=IST
        )
    )

    sales_by_date = defaultdict(float)

    for order in orders:
        if not order.created_at:
            continue

        order_date = order.created_at.astimezone(IST).date()

        if start_date <= order_date <= today:
            sales_by_date[order_date] += float(order.total_amount)

    result = []

    for i in range(7):
        current_date = start_date + timedelta(days=i)

        result.append({
            "date": current_date.isoformat(),
            "revenue": round(
                sales_by_date[current_date],
                2
            )
        })

    return {
        "period": "last_7_days",
        "sales": result
    }


# --------------------------------------------------
# 3. MONTHLY SALES - LAST 12 MONTHS
# --------------------------------------------------

@router.get("/monthly-sales")
def monthly_sales(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    today = datetime.now(IST).date()

    current_month = today.replace(day=1)

    month_starts = []

    for i in range(11, -1, -1):
        year = current_month.year
        month = current_month.month - i

        while month <= 0:
            month += 12
            year -= 1

        month_starts.append(date(year, month, 1))

    first_month = month_starts[0]

    orders = get_sales_orders(
        db,
        datetime.combine(
            first_month,
            time.min,
            tzinfo=IST
        )
    )

    sales_by_month = defaultdict(float)

    for order in orders:
        if not order.created_at:
            continue

        order_date = order.created_at.astimezone(IST).date()
        month_key = (order_date.year, order_date.month)

        sales_by_month[month_key] += float(order.total_amount)

    result = []

    for month_date in month_starts:
        key = (month_date.year, month_date.month)

        result.append({
            "month": month_date.strftime("%b %Y"),
            "revenue": round(sales_by_month[key], 2)
        })

    return {
        "period": "last_12_months",
        "sales": result
    }


# --------------------------------------------------
# 4. BEST-SELLING PRODUCTS
# --------------------------------------------------

@router.get("/best-selling-products")
def best_selling_products(
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    limit = max(1, min(limit, 50))

    results = (
        db.query(
            OrderItem.product_name,
            func.sum(OrderItem.quantity).label("total_quantity"),
            func.sum(OrderItem.line_total).label("total_sales")
        )
        .join(Order, OrderItem.order_id == Order.id)
        .filter(
            Order.payment_status == "paid",
            Order.order_status != "cancelled"
        )
        .group_by(OrderItem.product_name)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "product_name": item.product_name,
            "total_quantity_sold": int(item.total_quantity or 0),
            "total_sales": decimal_to_float(item.total_sales)
        }
        for item in results
    ]


# --------------------------------------------------
# 5. LOW-STOCK PRODUCTS
# --------------------------------------------------

@router.get("/low-stock-products")
def low_stock_products(
    threshold: int = 5,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    threshold = max(0, min(threshold, 1000))

    products = (
        db.query(Product)
        .filter(Product.stock <= threshold)
        .order_by(Product.stock.asc())
        .all()
    )

    return [
        {
            "id": product.id,
            "name": product.name,
            "category": product.category,
            "stock": product.stock,
            "price": float(product.price),
            "is_available": product.is_available
        }
        for product in products
    ]


# --------------------------------------------------
# 6. RECENT ORDERS
# --------------------------------------------------

@router.get("/recent-orders")
def recent_orders(
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    limit = max(1, min(limit, 100))

    orders = (
        db.query(Order)
        .order_by(Order.created_at.desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "id": order.id,
            "order_number": order.order_number,
            "customer_id": order.customer_id,
            "delivery_type": order.delivery_type,
            "total_amount": float(order.total_amount),
            "payment_method": order.payment_method,
            "payment_status": order.payment_status,
            "order_status": order.order_status,
            "created_at": order.created_at
        }
        for order in orders
    ]


# --------------------------------------------------
# 7. PAYMENT STATISTICS
# --------------------------------------------------

@router.get("/payment-statistics")
def payment_statistics(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    total_payments = db.query(
        func.count(Payment.id)
    ).scalar() or 0

    paid_payments = db.query(
        func.count(Payment.id)
    ).filter(
        Payment.status == "paid"
    ).scalar() or 0

    pending_payments = db.query(
        func.count(Payment.id)
    ).filter(
        Payment.status.in_(["pending", "refund_pending"])
    ).scalar() or 0

    failed_payments = db.query(
        func.count(Payment.id)
    ).filter(
        Payment.status == "failed"
    ).scalar() or 0

    refunded_payments = db.query(
        func.count(Payment.id)
    ).filter(
        Payment.status == "refunded"
    ).scalar() or 0

    total_collected = db.query(
        func.coalesce(func.sum(Payment.amount), 0)
    ).filter(
        Payment.status == "paid"
    ).scalar()

    return {
        "total_payments": total_payments,
        "paid_payments": paid_payments,
        "pending_payments": pending_payments,
        "failed_payments": failed_payments,
        "refunded_payments": refunded_payments,
        "total_collected": decimal_to_float(total_collected)
    }
