
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.order import Order
from app.schemas.user import (
    AdminCustomerResponse,
    CustomerStatusUpdate
)
from app.schemas.order import OrderResponse
from app.routers.auth import require_admin


router = APIRouter(
    prefix="/admin/customers",
    tags=["Admin Customer Management"]
)


# ADMIN: View all customers
@router.get("/", response_model=list[AdminCustomerResponse])
def get_all_customers(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
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


# ADMIN: Search customers
@router.get("/search", response_model=list[AdminCustomerResponse])
def search_customers(
    keyword: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    search_term = f"%{keyword.strip()}%"
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


# ADMIN: View customer details
@router.get("/{customer_id}", response_model=AdminCustomerResponse)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
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


# ADMIN: Activate or deactivate customer
@router.patch("/{customer_id}/status", response_model=AdminCustomerResponse)
def update_customer_status(
    customer_id: int,
    status_data: CustomerStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
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


# ADMIN: View a customer's order history
@router.get("/{customer_id}/orders", response_model=list[OrderResponse])
def get_customer_orders(
    customer_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
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
