
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models.coupon import Coupon
from app.models.user import User
from app.schemas.coupon import (
    CouponCreate,
    CouponUpdate,
    CouponResponse,
    CouponValidate
)
from app.routers.auth import require_admin


router = APIRouter(
    prefix="/coupons",
    tags=["Coupons"]
)


def normalize_coupon_code(code: str) -> str:
    return code.strip().upper()


def normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


def validate_coupon_configuration(
    discount_type,
    discount_value,
    max_discount,
    start_date,
    expiry_date
):
    start_date = normalize_datetime(start_date)
    expiry_date = normalize_datetime(expiry_date)

    if expiry_date <= start_date:
        raise HTTPException(
            status_code=400,
            detail="Expiry date must be later than start date"
        )

    discount_value = Decimal(str(discount_value))

    if discount_value <= 0:
        raise HTTPException(
            status_code=400,
            detail="Discount value must be greater than zero"
        )

    if discount_type == "percentage":
        if discount_value > 100:
            raise HTTPException(
                status_code=400,
                detail="Percentage discount cannot exceed 100"
            )

    elif discount_type == "fixed":
        if max_discount is not None:
            raise HTTPException(
                status_code=400,
                detail="Maximum discount is only for percentage coupons"
            )

    else:
        raise HTTPException(
            status_code=400,
            detail="Invalid discount type"
        )


# ADMIN: Create coupon
@router.post(
    "/",
    response_model=CouponResponse,
    status_code=201
)
def create_coupon(
    coupon_data: CouponCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    data = coupon_data.model_dump()

    data["code"] = normalize_coupon_code(data["code"])

    validate_coupon_configuration(
        discount_type=data["discount_type"],
        discount_value=data["discount_value"],
        max_discount=data.get("max_discount_amount"),
        start_date=data["start_date"],
        expiry_date=data["expiry_date"]
    )

    existing = db.query(Coupon).filter(
        Coupon.code == data["code"]
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Coupon code already exists"
        )

    coupon = Coupon(**data)

    try:
        db.add(coupon)
        db.commit()
        db.refresh(coupon)

        return coupon

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=400,
            detail="Coupon code already exists"
        )

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not create coupon"
        )


# ADMIN: List all coupons
@router.get(
    "/",
    response_model=list[CouponResponse]
)
def get_all_coupons(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100)
):
    return (
        db.query(Coupon)
        .order_by(Coupon.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


# ADMIN: Update coupon
@router.put(
    "/{coupon_id}",
    response_model=CouponResponse
)
def update_coupon(
    coupon_id: int,
    coupon_data: CouponUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    coupon = db.query(Coupon).filter(
        Coupon.id == coupon_id
    ).with_for_update().first()

    if not coupon:
        raise HTTPException(
            status_code=404,
            detail="Coupon not found"
        )

    update_data = coupon_data.model_dump(
        exclude_unset=True
    )

    if "code" in update_data and update_data["code"] is not None:
        update_data["code"] = normalize_coupon_code(
            update_data["code"]
        )

        existing = db.query(Coupon).filter(
            Coupon.code == update_data["code"],
            Coupon.id != coupon_id
        ).first()

        if existing:
            raise HTTPException(
                status_code=400,
                detail="Coupon code already exists"
            )

    # Validate combined existing and updated values
    discount_type = update_data.get(
        "discount_type",
        coupon.discount_type
    )

    discount_value = update_data.get(
        "discount_value",
        coupon.discount_value
    )

    max_discount = update_data.get(
        "max_discount_amount",
        coupon.max_discount_amount
    )

    start_date = update_data.get(
        "start_date",
        coupon.start_date
    )

    expiry_date = update_data.get(
        "expiry_date",
        coupon.expiry_date
    )

    validate_coupon_configuration(
        discount_type=discount_type,
        discount_value=discount_value,
        max_discount=max_discount,
        start_date=start_date,
        expiry_date=expiry_date
    )

    try:
        for field, value in update_data.items():
            setattr(coupon, field, value)

        db.commit()
        db.refresh(coupon)

        return coupon

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=400,
            detail="Coupon code already exists"
        )

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not update coupon"
        )


# ADMIN: Delete coupon
@router.delete("/{coupon_id}")
def delete_coupon(
    coupon_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    coupon = db.query(Coupon).filter(
        Coupon.id == coupon_id
    ).first()

    if not coupon:
        raise HTTPException(
            status_code=404,
            detail="Coupon not found"
        )

    try:
        db.delete(coupon)
        db.commit()

        return {
            "message": "Coupon deleted successfully"
        }

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not delete coupon"
        )


# CUSTOMER: Validate coupon and calculate discount
@router.post("/validate")
def validate_coupon(
    coupon_data: CouponValidate,
    db: Session = Depends(get_db)
):
    normalized_code = normalize_coupon_code(
        coupon_data.code
    )

    coupon = db.query(Coupon).filter(
        Coupon.code == normalized_code
    ).first()

    if not coupon or not coupon.is_active:
        raise HTTPException(
            status_code=404,
            detail="Invalid or inactive coupon"
        )

    now = datetime.now(timezone.utc)

    start_date = normalize_datetime(coupon.start_date)
    expiry_date = normalize_datetime(coupon.expiry_date)

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

    order_amount = Decimal(
        str(coupon_data.order_amount)
    )

    minimum_amount = Decimal(
        str(coupon.min_order_amount)
    )

    if order_amount < minimum_amount:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum order amount is {minimum_amount}"
        )

    discount_value = Decimal(
        str(coupon.discount_value)
    )

    if coupon.discount_type == "percentage":

        discount = (
            order_amount
            * discount_value
            / Decimal("100")
        )

        if coupon.max_discount_amount is not None:
            discount = min(
                discount,
                Decimal(str(coupon.max_discount_amount))
            )

    else:
        discount = discount_value

    discount = min(
        discount,
        order_amount
    ).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP
    )

    final_amount = (
        order_amount - discount
    ).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP
    )

    return {
        "valid": True,
        "coupon_code": coupon.code,
        "discount_type": coupon.discount_type,
        "discount_value": coupon.discount_value,
        "discount_amount": discount,
        "original_amount": order_amount,
        "final_amount": final_amount
    }
