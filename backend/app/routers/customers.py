
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.order import Order
from app.schemas.user import (
    AdminCustomerResponse,
    CustomerStatusUpdate
)
from app.schemas.order import OrderResponse
from app.routers.auth import require_section_access


router = APIRouter(
    prefix="/admin/customers",
    tags=["Admin Customer Management"]
)


# ADMIN: Customer statistics
@router.get("/summary")
def get_customer_summary(
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("customers"))
):
    customers = db.query(User).filter(
        User.role == "customer"
    )

    total_customers = customers.count()

    active_customers = customers.filter(
        User.is_active.is_(True)
    ).count()

    inactive_customers = customers.filter(
        User.is_active.is_(False)
    ).count()

    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)

    new_customers = customers.filter(
        User.created_at >= thirty_days_ago
    ).count()

    # Count orders per customer, excluding cancelled orders.
    order_counts = (
        db.query(
            Order.customer_id.label("customer_id"),
            func.count(Order.id).label("order_count")
        )
        .join(User, User.id == Order.customer_id)
        .filter(
            User.role == "customer",
            Order.order_status != "cancelled"
        )
        .group_by(Order.customer_id)
        .subquery()
    )

    repeat_customers = (
        db.query(func.count())
        .select_from(order_counts)
        .filter(order_counts.c.order_count >= 2)
        .scalar()
    ) or 0

    # Only successfully paid orders count toward customer spending.
    total_customer_spending = (
        db.query(
            func.coalesce(func.sum(Order.total_amount), 0)
        )
        .join(User, User.id == Order.customer_id)
        .filter(
            User.role == "customer",
            Order.payment_status == "paid"
        )
        .scalar()
    ) or 0

    return {
        "total_customers": total_customers,
        "active_customers": active_customers,
        "inactive_customers": inactive_customers,
        "new_customers_last_30_days": new_customers,
        "repeat_customers": repeat_customers,
        "total_customer_spending": round(
            float(total_customer_spending), 2
        )
    }


# ADMIN: Paginated customer list with filters and total count
@router.get("/list")
def get_customers_list(
    keyword: str | None = Query(None, min_length=1),
    is_active: bool | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("customers"))
):
    query = db.query(User).filter(
        User.role == "customer"
    )

    if is_active is not None:
        query = query.filter(User.is_active.is_(is_active))

    if keyword:
        search_term = f"%{keyword.strip()}%"

        query = query.filter(
            (User.full_name.ilike(search_term)) |
            (User.email.ilike(search_term)) |
            (User.phone.ilike(search_term))
        )

    total = query.count()

    customers = (
        query
        .order_by(User.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": [
            AdminCustomerResponse.model_validate(customer).model_dump()
            for customer in customers
        ]
    }


# ADMIN: View all customers (existing endpoint preserved)
@router.get("/", response_model=list[AdminCustomerResponse])
def get_all_customers(
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("customers")),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100)
):
    return (
        db.query(User)
        .filter(User.role == "customer")
        .order_by(User.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


# ADMIN: Search customers (existing endpoint preserved)
@router.get("/search", response_model=list[AdminCustomerResponse])
def search_customers(
    keyword: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("customers"))
):
    keyword = keyword.strip()

    if not keyword:
        raise HTTPException(
            status_code=400,
            detail="Search keyword cannot be empty"
        )

    search_term = f"%{keyword}%"

    return (
        db.query(User)
        .filter(
            User.role == "customer",
            (
                User.full_name.ilike(search_term) |
                User.email.ilike(search_term) |
                User.phone.ilike(search_term)
            )
        )
        .order_by(User.id.desc())
        .limit(100)
        .all()
    )


# ADMIN: View enhanced customer overview
@router.get("/{customer_id}/overview")
def get_customer_overview(
    customer_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("customers"))
):
    customer = db.query(User).filter(
        User.id == customer_id,
        User.role == "customer"
    ).first()

    if not customer:
        raise HTTPException(
            status_code=404,
            detail="Customer not found"
        )

    customer_orders = db.query(Order).filter(
        Order.customer_id == customer_id
    )

    total_orders = customer_orders.count()

    non_cancelled_orders = customer_orders.filter(
        Order.order_status != "cancelled"
    ).count()

    total_spending = (
        db.query(func.coalesce(func.sum(Order.total_amount), 0))
        .filter(
            Order.customer_id == customer_id,
            Order.payment_status == "paid"
        )
        .scalar()
    ) or 0

    return {
        "id": customer.id,
        "full_name": customer.full_name,
        "email": customer.email,
        "phone": customer.phone,
        "role": customer.role,
        "is_active": customer.is_active,
        "created_at": customer.created_at,
        "total_orders": total_orders,
        "non_cancelled_orders": non_cancelled_orders,
        "total_spending": round(float(total_spending), 2)
    }


# ADMIN: View customer details (existing endpoint preserved)
@router.get("/{customer_id}", response_model=AdminCustomerResponse)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("customers"))
):
    customer = db.query(User).filter(
        User.id == customer_id,
        User.role == "customer"
    ).first()

    if not customer:
        raise HTTPException(
            status_code=404,
            detail="Customer not found"
        )

    return customer


# ADMIN: Activate or deactivate customer (existing endpoint preserved)
@router.patch("/{customer_id}/status", response_model=AdminCustomerResponse)
def update_customer_status(
    customer_id: int,
    status_data: CustomerStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("customers"))
):
    customer = db.query(User).filter(
        User.id == customer_id,
        User.role == "customer"
    ).first()

    if not customer:
        raise HTTPException(
            status_code=404,
            detail="Customer not found"
        )

    customer.is_active = status_data.is_active

    try:
        db.commit()
        db.refresh(customer)
        return customer

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not update customer status"
        )


# ADMIN: View a customer's order history (existing endpoint preserved)
@router.get("/{customer_id}/orders", response_model=list[OrderResponse])
def get_customer_orders(
    customer_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("customers")),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100)
):
    customer = db.query(User).filter(
        User.id == customer_id,
        User.role == "customer"
    ).first()

    if not customer:
        raise HTTPException(
            status_code=404,
            detail="Customer not found"
        )

    return (
        db.query(Order)
        .filter(Order.customer_id == customer_id)
        .order_by(Order.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
