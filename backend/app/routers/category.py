
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.category import Category
from app.models.product import Product
from app.models.user import User
from app.routers.auth import require_section_access
from app.schemas.category import (
    CategoryCreate,
    CategoryUpdate,
    CategoryResponse
)

router = APIRouter(
    prefix="/categories",
    tags=["Categories"]
)


# CREATE CATEGORY (ADMIN ONLY)
@router.post("/", response_model=CategoryResponse)
def create_category(
    category_data: CategoryCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("categories"))
):
    existing_category = db.query(Category).filter(
        func.lower(Category.name) == category_data.name.lower()
    ).first()

    if existing_category:
        raise HTTPException(
            status_code=400,
            detail="Category already exists"
        )

    new_category = Category(**category_data.model_dump())

    db.add(new_category)
    db.commit()
    db.refresh(new_category)

    return new_category


# GET ALL CATEGORIES (PUBLIC)
@router.get("/", response_model=list[CategoryResponse])
def get_categories(
    db: Session = Depends(get_db)
):
    return db.query(Category).order_by(Category.id).all()


# SHOP BY CATEGORY (PUBLIC)
@router.get("/home", response_model=list[CategoryResponse])
def get_home_categories(
    db: Session = Depends(get_db)
):
    return db.query(Category).filter(
        Category.is_active == True,
        Category.show_on_home == True
    ).order_by(
        Category.display_order.asc(),
        Category.name.asc()
    ).all()


# POPULAR CATEGORIES (PUBLIC)
@router.get("/popular", response_model=list[CategoryResponse])
def get_popular_categories(
    db: Session = Depends(get_db)
):
    return db.query(Category).filter(
        Category.is_active == True,
        Category.show_in_popular == True
    ).order_by(
        Category.popular_display_order.asc(),
        Category.name.asc()
    ).all()


# SEARCH CATEGORY (PUBLIC)
@router.get("/search/", response_model=list[CategoryResponse])
def search_categories(
    name: str = Query(..., min_length=1),
    db: Session = Depends(get_db)
):
    categories = db.query(Category).filter(
        Category.name.ilike(f"%{name.strip()}%")
    ).all()

    return categories


# UPDATE CATEGORY (ADMIN ONLY)
@router.put("/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: int,
    category_data: CategoryUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("categories"))
):
    category = db.query(Category).filter(
        Category.id == category_id
    ).first()

    if not category:
        raise HTTPException(
            status_code=404,
            detail="Category not found"
        )

    update_data = category_data.model_dump(exclude_unset=True)

    # Check whether the new name already exists
    if "name" in update_data:
        existing_category = db.query(Category).filter(
            func.lower(Category.name) == update_data["name"].lower(),
            Category.id != category_id
        ).first()

        if existing_category:
            raise HTTPException(
                status_code=400,
                detail="Category name already exists"
            )

        # Keep existing products connected by their category name
        old_name = category.name
        new_name = update_data["name"]

        if old_name != new_name:
            db.query(Product).filter(
                Product.category == old_name
            ).update(
                {Product.category: new_name},
                synchronize_session=False
            )

    for key, value in update_data.items():
        setattr(category, key, value)

    db.commit()
    db.refresh(category)

    return category


# ACTIVATE / DEACTIVATE CATEGORY (ADMIN ONLY)
@router.patch("/{category_id}/status", response_model=CategoryResponse)
def update_category_status(
    category_id: int,
    is_active: bool,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("categories"))
):
    category = db.query(Category).filter(
        Category.id == category_id
    ).first()

    if not category:
        raise HTTPException(
            status_code=404,
            detail="Category not found"
        )

    category.is_active = is_active

    db.commit()
    db.refresh(category)

    return category


# DELETE CATEGORY (ADMIN ONLY)
@router.delete("/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("categories"))
):
    category = db.query(Category).filter(
        Category.id == category_id
    ).first()

    if not category:
        raise HTTPException(
            status_code=404,
            detail="Category not found"
        )

    # Products currently store category names as text
    existing_products = db.query(Product).filter(
        Product.category == category.name
    ).first()

    if existing_products:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete category because products are using it. Reassign those products first."
        )

    db.delete(category)
    db.commit()

    return {
        "message": "Category deleted successfully",
        "category_id": category_id
    }


# GET CATEGORY BY ID (PUBLIC)
@router.get("/{category_id}", response_model=CategoryResponse)
def get_category(
    category_id: int,
    db: Session = Depends(get_db)
):
    category = db.query(Category).filter(
        Category.id == category_id
    ).first()

    if not category:
        raise HTTPException(
            status_code=404,
            detail="Category not found"
        )

    return category
