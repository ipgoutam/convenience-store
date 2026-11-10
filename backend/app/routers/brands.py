
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models.brand import Brand
from app.models.product import Product
from app.models.user import User
from app.schemas.brand import (
    BrandCreate,
    BrandUpdate,
    BrandResponse
)
from app.schemas.product import ProductResponse
from app.routers.auth import require_section_access


router = APIRouter(
    prefix="/brands",
    tags=["Brands"]
)


# --------------------------------------------------
# 1. GET BRANDS FOR CUSTOMER HOME PAGE (PUBLIC)
# --------------------------------------------------

@router.get("/home", response_model=list[BrandResponse])
def get_home_brands(
    db: Session = Depends(get_db)
):
    return db.query(Brand).filter(
        Brand.is_active == True,
        Brand.show_on_home == True
    ).order_by(
        Brand.display_order.asc(),
        Brand.name.asc()
    ).all()


# --------------------------------------------------
# 2. GET ALL BRANDS (ADMIN ONLY)
# --------------------------------------------------

@router.get("/", response_model=list[BrandResponse])
def get_all_brands(
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("products"))
):
    return db.query(Brand).order_by(
        Brand.display_order.asc(),
        Brand.name.asc()
    ).all()


# --------------------------------------------------
# 3. GET PRODUCTS BY BRAND (PUBLIC)
# --------------------------------------------------

@router.get(
    "/{brand_id}/products",
    response_model=list[ProductResponse]
)
def get_products_by_brand(
    brand_id: int,
    db: Session = Depends(get_db)
):
    brand = db.query(Brand).filter(
        Brand.id == brand_id,
        Brand.is_active == True
    ).first()

    if not brand:
        raise HTTPException(
            status_code=404,
            detail="Brand not found or inactive"
        )

    return db.query(Product).filter(
        Product.brand_id == brand_id,
        Product.is_available == True
    ).order_by(
        Product.name.asc()
    ).all()


# --------------------------------------------------
# 4. CREATE BRAND (ADMIN ONLY)
# --------------------------------------------------

@router.post(
    "/",
    response_model=BrandResponse,
    status_code=201
)
def create_brand(
    brand_data: BrandCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("products"))
):
    existing_brand = db.query(Brand).filter(
        func.lower(Brand.name) == brand_data.name.lower()
    ).first()

    if existing_brand:
        raise HTTPException(
            status_code=409,
            detail="Brand already exists"
        )

    new_brand = Brand(**brand_data.model_dump())

    db.add(new_brand)

    try:
        db.commit()
        db.refresh(new_brand)

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail="Brand already exists"
        )

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not create brand"
        )

    return new_brand


# --------------------------------------------------
# 5. UPDATE BRAND (ADMIN ONLY)
# --------------------------------------------------

@router.put(
    "/{brand_id}",
    response_model=BrandResponse
)
def update_brand(
    brand_id: int,
    brand_data: BrandUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("products"))
):
    brand = db.query(Brand).filter(
        Brand.id == brand_id
    ).first()

    if not brand:
        raise HTTPException(
            status_code=404,
            detail="Brand not found"
        )

    update_data = brand_data.model_dump(exclude_unset=True)

    if not update_data:
        raise HTTPException(
            status_code=400,
            detail="No brand information was provided"
        )

    if "name" in update_data:
        if update_data["name"] is None:
            raise HTTPException(
                status_code=400,
                detail="Brand name cannot be empty"
            )

        existing_brand = db.query(Brand).filter(
            func.lower(Brand.name) == update_data["name"].lower(),
            Brand.id != brand_id
        ).first()

        if existing_brand:
            raise HTTPException(
                status_code=409,
                detail="Another brand already uses this name"
            )

        old_name = brand.name
        new_name = update_data["name"]

        if old_name != new_name:
            db.query(Product).filter(
                Product.brand_id == brand_id
            ).update(
                {Product.brand: new_name},
                synchronize_session=False
            )

    for field, value in update_data.items():
        setattr(brand, field, value)

    try:
        db.commit()
        db.refresh(brand)

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail="Could not update brand because of a conflict"
        )

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not update brand"
        )

    return brand


# --------------------------------------------------
# 6. DELETE BRAND (ADMIN ONLY)
# --------------------------------------------------

@router.delete("/{brand_id}")
def delete_brand(
    brand_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("products"))
):
    brand = db.query(Brand).filter(
        Brand.id == brand_id
    ).first()

    if not brand:
        raise HTTPException(
            status_code=404,
            detail="Brand not found"
        )

    # Preserve the existing brand text on products.
    # Only remove the foreign-key relationship.
    db.query(Product).filter(
        Product.brand_id == brand_id
    ).update(
        {Product.brand_id: None},
        synchronize_session=False
    )

    db.delete(brand)

    try:
        db.commit()

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not delete brand"
        )

    return {
        "message": "Brand deleted successfully",
        "brand_id": brand_id
    }
