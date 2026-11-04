import os
import uuid
from decimal import Decimal

from PIL import Image, UnidentifiedImageError

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Request,
    Query
)

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models.product import Product
from app.models.user import User
from app.schemas.product import (
    ProductCreate,
    ProductUpdate,
    ProductResponse
)
from app.routers.auth import require_admin


router = APIRouter(
    prefix="/products",
    tags=["Products"]
)


# --------------------------------------------------
# IMAGE UPLOAD SETTINGS
# --------------------------------------------------

UPLOAD_DIR = "uploads"

MAX_FILE_SIZE = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000

ALLOWED_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp"
}

ALLOWED_FORMATS = {
    "JPEG",
    "PNG",
    "WEBP"
}

EXTENSION_FORMATS = {
    ".jpg": "JPEG",
    ".jpeg": "JPEG",
    ".png": "PNG",
    ".webp": "WEBP"
}


# --------------------------------------------------
# HELPER: FIND PRODUCT
# --------------------------------------------------

def get_product_or_404(
    product_id: int,
    db: Session
):
    product = db.query(Product).filter(
        Product.id == product_id
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    return product


# --------------------------------------------------
# 1. UPLOAD PRODUCT IMAGE (ADMIN ONLY)
# --------------------------------------------------

@router.post("/upload-image/")
def upload_product_image(
    request: Request,
    file: UploadFile = File(...),
    admin: User = Depends(require_admin)
):
    extension = os.path.splitext(
        file.filename or ""
    )[1].lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only JPG, JPEG, PNG and WEBP images are allowed"
        )

    allowed_content_types = {
        "image/jpeg",
        "image/png",
        "image/webp"
    }

    if file.content_type not in allowed_content_types:
        raise HTTPException(
            status_code=400,
            detail="Invalid image content type"
        )

    try:
        file.file.seek(0, os.SEEK_END)
        file_size = file.file.tell()
        file.file.seek(0)

        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail="Image size must not exceed 5 MB"
            )

        with Image.open(file.file) as image:

            actual_format = image.format

            if actual_format not in ALLOWED_FORMATS:
                raise HTTPException(
                    status_code=400,
                    detail="Unsupported image format"
                )

            if actual_format != EXTENSION_FORMATS[extension]:
                raise HTTPException(
                    status_code=400,
                    detail="Image extension does not match its actual format"
                )

            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise HTTPException(
                    status_code=400,
                    detail="Image dimensions are too large"
                )

            image.verify()

    except HTTPException:
        raise

    except (
        UnidentifiedImageError,
        OSError,
        ValueError
    ):
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is not a valid image"
        )

    finally:
        file.file.seek(0)

    os.makedirs(UPLOAD_DIR, exist_ok=True)

    filename = f"{uuid.uuid4().hex}{extension}"

    file_path = os.path.join(
        UPLOAD_DIR,
        filename
    )

    try:
        with open(file_path, "wb") as buffer:
            while chunk := file.file.read(1024 * 1024):
                buffer.write(chunk)

    except OSError:
        if os.path.exists(file_path):
            os.remove(file_path)

        raise HTTPException(
            status_code=500,
            detail="Could not save image"
        )

    finally:
        file.file.close()

    image_url = str(
        request.url_for(
            "uploads",
            path=filename
        )
    )

    return {
        "message": "Image uploaded successfully",
        "image_url": image_url
    }


# --------------------------------------------------
# 2. CREATE PRODUCT (ADMIN ONLY)
# --------------------------------------------------

@router.post(
    "/",
    response_model=ProductResponse,
    status_code=201
)
def create_product(
    product_data: ProductCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    product_values = product_data.model_dump()

    new_product = Product(**product_values)

    db.add(new_product)

    try:
        db.commit()
        db.refresh(new_product)

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail="A product with this SKU or barcode already exists"
        )

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not create product"
        )

    return new_product


# --------------------------------------------------
# 3. GET ALL PRODUCTS (PUBLIC)
# --------------------------------------------------

@router.get(
    "/",
    response_model=list[ProductResponse]
)
def get_all_products(
    db: Session = Depends(get_db)
):
    return db.query(Product).order_by(
        Product.id.desc()
    ).all()


# --------------------------------------------------
# 4. SEARCH PRODUCTS (PUBLIC)
# --------------------------------------------------

@router.get(
    "/search/",
    response_model=list[ProductResponse]
)
def search_products(
    name: str = Query(..., min_length=1),
    db: Session = Depends(get_db)
):
    name = name.strip()

    if not name:
        raise HTTPException(
            status_code=400,
            detail="Search name cannot be empty"
        )

    return db.query(Product).filter(
        Product.name.ilike(f"%{name}%")
    ).all()


# --------------------------------------------------
# 5. FILTER PRODUCTS BY CATEGORY (PUBLIC)
# --------------------------------------------------

@router.get(
    "/category/",
    response_model=list[ProductResponse]
)
def get_products_by_category(
    category: str = Query(..., min_length=1),
    db: Session = Depends(get_db)
):
    category = category.strip()

    if not category:
        raise HTTPException(
            status_code=400,
            detail="Category cannot be empty"
        )

    return db.query(Product).filter(
        Product.category.ilike(category)
    ).all()


# --------------------------------------------------
# 6. GET AVAILABLE PRODUCTS (PUBLIC)
# --------------------------------------------------

@router.get(
    "/available/",
    response_model=list[ProductResponse]
)
def get_available_products(
    db: Session = Depends(get_db)
):
    return db.query(Product).filter(
        Product.is_available == True
    ).all()


# --------------------------------------------------
# 7. SORT PRODUCTS BY PRICE (PUBLIC)
# --------------------------------------------------

@router.get(
    "/sort/",
    response_model=list[ProductResponse]
)
def sort_products(
    order: str = "asc",
    db: Session = Depends(get_db)
):
    order = order.lower()

    if order not in ["asc", "desc"]:
        raise HTTPException(
            status_code=400,
            detail="Order must be asc or desc"
        )

    if order == "asc":
        return db.query(Product).order_by(
            Product.price.asc()
        ).all()

    return db.query(Product).order_by(
        Product.price.desc()
    ).all()


# --------------------------------------------------
# 8. FILTER PRODUCTS BY PRICE RANGE (PUBLIC)
# --------------------------------------------------

@router.get(
    "/price-range/",
    response_model=list[ProductResponse]
)
def filter_products_by_price(
    min_price: Decimal = Query(
        default=Decimal("0"),
        ge=0
    ),
    max_price: Decimal = Query(
        default=Decimal("1000"),
        gt=0
    ),
    db: Session = Depends(get_db)
):
    if max_price < min_price:
        raise HTTPException(
            status_code=400,
            detail="Maximum price must be greater than or equal to minimum price"
        )

    return db.query(Product).filter(
        Product.price >= min_price,
        Product.price <= max_price
    ).all()


# --------------------------------------------------
# 9. GET PRODUCTS WITH PAGINATION (PUBLIC)
# --------------------------------------------------

@router.get(
    "/pagination/",
    response_model=list[ProductResponse]
)
def get_products_paginated(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db)
):
    offset = (page - 1) * limit

    return db.query(Product).order_by(
        Product.id.desc()
    ).offset(offset).limit(limit).all()


# --------------------------------------------------
# 10. GET LOW STOCK PRODUCTS (ADMIN ONLY)
# --------------------------------------------------

@router.get(
    "/low-stock/",
    response_model=list[ProductResponse]
)
def get_low_stock_products(
    threshold: int = Query(default=10, ge=0),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    return db.query(Product).filter(
        Product.stock <= threshold
    ).all()


# --------------------------------------------------
# 11. GET PRODUCT STATISTICS (ADMIN ONLY)
# --------------------------------------------------

@router.get("/count/")
def get_product_count(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    total_products = db.query(Product).count()

    available_products = db.query(Product).filter(
        Product.is_available == True
    ).count()

    unavailable_products = (
        total_products - available_products
    )

    return {
        "total_products": total_products,
        "available_products": available_products,
        "unavailable_products": unavailable_products
    }


# --------------------------------------------------
# 12. UPDATE PRODUCT STOCK (ADMIN ONLY)
# --------------------------------------------------

@router.patch("/{product_id}/stock")
def update_product_stock(
    product_id: int,
    quantity: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    product = get_product_or_404(
        product_id,
        db
    )

    new_stock = product.stock + quantity

    if new_stock < 0:
        raise HTTPException(
            status_code=400,
            detail="Stock cannot become negative"
        )

    product.stock = new_stock

    try:
        db.commit()
        db.refresh(product)

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not update product stock"
        )

    return {
        "message": "Stock updated successfully",
        "product_id": product.id,
        "product_name": product.name,
        "updated_stock": product.stock
    }


# --------------------------------------------------
# 13. UPDATE PRODUCT AVAILABILITY (ADMIN ONLY)
# --------------------------------------------------

@router.patch("/{product_id}/availability")
def update_product_availability(
    product_id: int,
    is_available: bool,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    product = get_product_or_404(
        product_id,
        db
    )

    product.is_available = is_available

    try:
        db.commit()
        db.refresh(product)

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not update product availability"
        )

    return {
        "message": "Product availability updated successfully",
        "product_id": product.id,
        "is_available": product.is_available
    }


# --------------------------------------------------
# 14. GET PRODUCT BY ID (PUBLIC)
# --------------------------------------------------

@router.get(
    "/{product_id}",
    response_model=ProductResponse
)
def get_product(
    product_id: int,
    db: Session = Depends(get_db)
):
    return get_product_or_404(
        product_id,
        db
    )


# --------------------------------------------------
# 15. UPDATE PRODUCT (ADMIN ONLY)
# --------------------------------------------------

@router.put(
    "/{product_id}",
    response_model=ProductResponse
)
def update_product(
    product_id: int,
    updated_product: ProductUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    product = get_product_or_404(
        product_id,
        db
    )

    update_data = updated_product.model_dump(
        exclude_unset=True
    )

    if not update_data:
        raise HTTPException(
            status_code=400,
            detail="No product information was provided"
        )

    # These database fields cannot be set to None.
    non_nullable_fields = {
        "name",
        "category",
        "price",
        "discount_percentage",
        "unit",
        "stock",
        "is_available"
    }

    for field, value in update_data.items():
        if field in non_nullable_fields and value is None:
            raise HTTPException(
                status_code=400,
                detail=f"{field} cannot be empty"
            )

    # Validate the final price and MRP together,
    # including values already stored in the database.
    final_price = update_data.get(
        "price",
        product.price
    )

    final_mrp = update_data.get(
        "mrp",
        product.mrp
    )

    if final_mrp is not None and final_price > final_mrp:
        raise HTTPException(
            status_code=400,
            detail="Selling price cannot be greater than MRP"
        )

    for field, value in update_data.items():
        setattr(product, field, value)

    try:
        db.commit()
        db.refresh(product)

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail="A product with this SKU or barcode already exists"
        )

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not update product"
        )

    return product


# --------------------------------------------------
# 16. DELETE PRODUCT (ADMIN ONLY)
# --------------------------------------------------

@router.delete("/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    product = get_product_or_404(
        product_id,
        db
    )

    db.delete(product)

    try:
        db.commit()

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not delete product"
        )

    return {
        "message": "Product deleted successfully",
        "product_id": product_id
    }