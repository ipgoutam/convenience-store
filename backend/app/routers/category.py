
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.category import Category
from app.models.product import Product
from app.schemas.category import (
    CategoryCreate,
    CategoryUpdate,
    CategoryResponse
)

router = APIRouter(
    prefix="/categories",
    tags=["Categories"]
)


# CREATE CATEGORY
@router.post("/", response_model=CategoryResponse)
def create_category(
    category_data: CategoryCreate,
    db: Session = Depends(get_db)
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


# GET ALL CATEGORIES
@router.get("/", response_model=list[CategoryResponse])
def get_categories(
    db: Session = Depends(get_db)
):
    return db.query(Category).order_by(Category.id).all()


# SEARCH CATEGORY
@router.get("/search/", response_model=list[CategoryResponse])
def search_categories(
    name: str = Query(..., min_length=1),
    db: Session = Depends(get_db)
):
    categories = db.query(Category).filter(
        Category.name.ilike(f"%{name.strip()}%")
    ).all()

    return categories


# UPDATE CATEGORY
@router.put("/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: int,
    category_data: CategoryUpdate,
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


# ACTIVATE / DEACTIVATE CATEGORY
@router.patch("/{category_id}/status", response_model=CategoryResponse)
def update_category_status(
    category_id: int,
    is_active: bool,
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

    category.is_active = is_active

    db.commit()
    db.refresh(category)

    return category


# DELETE CATEGORY
@router.delete("/{category_id}")
def delete_category(
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


# GET CATEGORY BY ID
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
