
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.homepage import HomepageHeroProduct
from app.models.product import Product
from app.models.user import User
from app.schemas.homepage import (
    HomepageHeroProductCreate,
    HomepageHeroProductUpdate,
    HomepageHeroProductResponse,
    HomepageHeroReorderRequest
)
from app.schemas.product import ProductResponse
from app.routers.auth import require_section_access


router = APIRouter(
    prefix="/homepage",
    tags=["Homepage"]
)


# --------------------------------------------------
# 1. GET HERO CAROUSEL (PUBLIC)
# --------------------------------------------------

@router.get(
    "/hero",
    response_model=list[HomepageHeroProductResponse]
)
def get_homepage_hero(
    db: Session = Depends(get_db)
):
    entries = db.query(HomepageHeroProduct).join(
        Product,
        HomepageHeroProduct.product_id == Product.id
    ).filter(
        HomepageHeroProduct.is_visible == True,
        Product.is_available == True,
        Product.stock > 0
    ).order_by(
        HomepageHeroProduct.display_order.asc(),
        HomepageHeroProduct.id.asc()
    ).all()

    return [
        {
            "id": entry.id,
            "product_id": entry.product_id,
            "display_order": entry.display_order,
            "is_visible": entry.is_visible,
            "created_at": entry.created_at,
            "updated_at": entry.updated_at,
            "product": entry_product
        }
        for entry in entries
        for entry_product in [
            db.query(Product).filter(
                Product.id == entry.product_id
            ).first()
        ]
        if entry_product is not None
    ]


# --------------------------------------------------
# 2. GET ALL HERO ENTRIES (ADMIN ONLY)
# --------------------------------------------------

@router.get(
    "/hero/admin",
    response_model=list[HomepageHeroProductResponse]
)
def get_all_hero_entries(
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("homepage"))
):
    entries = db.query(HomepageHeroProduct).order_by(
        HomepageHeroProduct.display_order.asc(),
        HomepageHeroProduct.id.asc()
    ).all()

    return [
        {
            "id": entry.id,
            "product_id": entry.product_id,
            "display_order": entry.display_order,
            "is_visible": entry.is_visible,
            "created_at": entry.created_at,
            "updated_at": entry.updated_at,
            "product": db.query(Product).filter(
                Product.id == entry.product_id
            ).first()
        }
        for entry in entries
    ]


# --------------------------------------------------
# BULK REORDER HERO PRODUCTS (ADMIN ONLY)
# --------------------------------------------------

@router.put("/hero/reorder")
def reorder_hero_products(
    data: HomepageHeroReorderRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("homepage"))
):
    entries = db.query(HomepageHeroProduct).all()

    existing_ids = {entry.id for entry in entries}
    submitted_ids = set(data.entry_ids)

    # Every existing entry must be included exactly once
    if existing_ids != submitted_ids:
        raise HTTPException(
            status_code=400,
            detail="Please provide all existing hero entry IDs exactly once"
        )

    entries_by_id = {
        entry.id: entry
        for entry in entries
    }

    # Save the new display order
    for position, entry_id in enumerate(data.entry_ids):
        entries_by_id[entry_id].display_order = position

    db.commit()

    return {
        "message": "Hero products reordered successfully",
        "total_products": len(data.entry_ids),
        "entry_ids": data.entry_ids
    }

# --------------------------------------------------
# 3. ADD PRODUCT TO HERO (ADMIN ONLY)
# --------------------------------------------------

@router.post(
    "/hero",
    response_model=HomepageHeroProductResponse,
    status_code=201
)
def add_hero_product(
    data: HomepageHeroProductCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("homepage"))
):
    product = db.query(Product).filter(
        Product.id == data.product_id
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    existing = db.query(HomepageHeroProduct).filter(
        HomepageHeroProduct.product_id == data.product_id
    ).first()

    if existing:
        raise HTTPException(
            status_code=409,
            detail="This product is already in the hero carousel"
        )

    entry = HomepageHeroProduct(**data.model_dump())

    db.add(entry)
    db.commit()
    db.refresh(entry)

    return {
        "id": entry.id,
        "product_id": entry.product_id,
        "display_order": entry.display_order,
        "is_visible": entry.is_visible,
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
        "product": product
    }


# --------------------------------------------------
# 4. UPDATE HERO ENTRY (ADMIN ONLY)
# --------------------------------------------------

@router.put(
    "/hero/{entry_id}",
    response_model=HomepageHeroProductResponse
)
def update_hero_product(
    entry_id: int,
    data: HomepageHeroProductUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("homepage"))
):
    entry = db.query(HomepageHeroProduct).filter(
        HomepageHeroProduct.id == entry_id
    ).first()

    if not entry:
        raise HTTPException(
            status_code=404,
            detail="Hero carousel entry not found"
        )

    update_data = data.model_dump(exclude_unset=True)

    if not update_data:
        raise HTTPException(
            status_code=400,
            detail="No update information provided"
        )

    for field, value in update_data.items():
        setattr(entry, field, value)

    db.commit()
    db.refresh(entry)

    product = db.query(Product).filter(
        Product.id == entry.product_id
    ).first()

    return {
        "id": entry.id,
        "product_id": entry.product_id,
        "display_order": entry.display_order,
        "is_visible": entry.is_visible,
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
        "product": product
    }


# --------------------------------------------------
# 5. REMOVE PRODUCT FROM HERO (ADMIN ONLY)
# --------------------------------------------------

@router.delete("/hero/{entry_id}")
def delete_hero_product(
    entry_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("homepage"))
):
    entry = db.query(HomepageHeroProduct).filter(
        HomepageHeroProduct.id == entry_id
    ).first()

    if not entry:
        raise HTTPException(
            status_code=404,
            detail="Hero carousel entry not found"
        )

    db.delete(entry)
    db.commit()

    return {
        "message": "Product removed from hero carousel",
        "entry_id": entry_id
    }


# --------------------------------------------------
# 6. SPECIAL OFFERS (PUBLIC)
# --------------------------------------------------

@router.get(
    "/special-offers",
    response_model=list[ProductResponse]
)
def get_special_offers(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    return db.query(Product).filter(
        Product.is_available == True,
        Product.stock > 0,
        Product.discount_percentage > 0
    ).order_by(
        Product.discount_percentage.desc(),
        Product.id.desc()
    ).limit(limit).all()


# --------------------------------------------------
# 7. RECENTLY ADDED PRODUCTS (PUBLIC)
# --------------------------------------------------

@router.get(
    "/recently-added",
    response_model=list[ProductResponse]
)
def get_recently_added(
    limit: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db)
):
    return db.query(Product).filter(
        Product.is_available == True,
        Product.stock > 0
    ).order_by(
        Product.created_at.desc(),
        Product.id.desc()
    ).limit(limit).all()
