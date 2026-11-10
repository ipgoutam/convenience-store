
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
from app.routers.auth import require_section_access
from app.models.inventory_movement import InventoryMovement
from app.models.brand import Brand

# Restock notification models and service
from app.models.stock_notification_subscription import (
    StockNotificationSubscription
)
from app.services.notification_service import create_notification


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
# HELPER: SEND RESTOCK NOTIFICATIONS
# --------------------------------------------------

def notify_product_back_in_stock(
    db: Session,
    product: Product
):
    """
    Notify active subscribers when a product becomes
    available again.

    Notifications are created inside the current database
    transaction and delivered after commit by the existing
    notification service.
    """

    subscriptions = db.query(
        StockNotificationSubscription
    ).filter(
        StockNotificationSubscription.product_id == product.id,
        StockNotificationSubscription.is_active == True,
        StockNotificationSubscription.notified_at.is_(None)
    ).all()

    now_subscribers = []

    for subscription in subscriptions:

        create_notification(
            db=db,
            user_id=subscription.user_id,
            title="Product Back in Stock!",
            message=(
                f"{product.name} is available again. "
                "Visit G-MART to order it now."
            ),
            notification_type="product_restock"
        )

        from datetime import datetime, timezone

        subscription.notified_at = datetime.now(timezone.utc)

        now_subscribers.append(subscription.user_id)

    return len(now_subscribers)


# --------------------------------------------------
# HELPER: HANDLE RESTOCK TRANSITION
# --------------------------------------------------

def handle_stock_increase(
    db: Session,
    product: Product,
    previous_stock: int,
    previous_availability: bool
):
    was_out_of_stock = (
        previous_stock <= 0 or not previous_availability
    )

    is_now_available = (
        product.stock > 0 and product.is_available
    )

    if was_out_of_stock and is_now_available:
        return notify_product_back_in_stock(
            db,
            product
        )

    return 0


# --------------------------------------------------
# 1. UPLOAD PRODUCT IMAGE (ADMIN ONLY)
# --------------------------------------------------

@router.post("/upload-image/")
def upload_product_image(
    request: Request,
    file: UploadFile = File(...),
    admin: User = Depends(require_section_access("products"))
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
    admin: User = Depends(require_section_access("products"))
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
# 5A. POPULAR CATEGORY PRODUCTS (PUBLIC)
# --------------------------------------------------

@router.get(
    "/popular-category/",
    response_model=list[ProductResponse]
)
def get_popular_category_products(
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
        Product.category.ilike(category),
        Product.is_available == True,
        Product.stock > 0
    ).order_by(
        Product.popular_display_order.asc(),
        Product.name.asc(),
        Product.id.asc()
    ).all()


# --------------------------------------------------
# ADMIN: GET PRODUCTS FOR POPULAR CATEGORY ORDERING
# --------------------------------------------------

@router.get(
    "/popular-category/admin/",
    response_model=list[ProductResponse]
)
def get_popular_category_products_admin(
    category: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("homepage"))
):
    category = category.strip()

    if not category:
        raise HTTPException(
            status_code=400,
            detail="Category cannot be empty"
        )

    return db.query(Product).filter(
        Product.category.ilike(category)
    ).order_by(
        Product.popular_display_order.asc(),
        Product.name.asc(),
        Product.id.asc()
    ).all()


# --------------------------------------------------
# ADMIN: SAVE POPULAR CATEGORY PRODUCT ORDER
# --------------------------------------------------

@router.put("/popular-category/reorder/")
def reorder_popular_category_products(
    category: str = Query(..., min_length=1),
    product_ids: list[int] = Query(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("homepage"))
):
    category = category.strip()

    if not category:
        raise HTTPException(
            status_code=400,
            detail="Category cannot be empty"
        )

    if len(product_ids) != len(set(product_ids)):
        raise HTTPException(
            status_code=400,
            detail="Duplicate product IDs are not allowed"
        )

    products = db.query(Product).filter(
        Product.category.ilike(category)
    ).all()

    existing_ids = {product.id for product in products}
    submitted_ids = set(product_ids)

    if existing_ids != submitted_ids:
        raise HTTPException(
            status_code=400,
            detail="Please provide every product in this category exactly once"
        )

    products_by_id = {
        product.id: product
        for product in products
    }

    try:
        for position, product_id in enumerate(product_ids):
            products_by_id[product_id].popular_display_order = position

        db.commit()

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not save product order"
        )

    return {
        "message": "Popular category product order saved successfully",
        "category": category,
        "total_products": len(product_ids),
        "product_ids": product_ids
    }


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
    admin: User = Depends(require_section_access("products"))
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
    admin: User = Depends(require_section_access("products"))
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
    reason: str = Query(
        default="Manual stock adjustment",
        min_length=3,
        max_length=250
    ),
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("products"))
):
    product = get_product_or_404(product_id, db)

    previous_stock = product.stock
    previous_availability = product.is_available

    new_stock = previous_stock + quantity

    if new_stock < 0:
        raise HTTPException(
            status_code=400,
            detail="Stock cannot become negative"
        )

    if quantity == 0:
        raise HTTPException(
            status_code=400,
            detail="Stock adjustment quantity cannot be zero"
        )

    product.stock = new_stock

    movement = InventoryMovement(
        product_id=product.id,
        product_name=product.name,
        quantity_change=quantity,
        previous_stock=previous_stock,
        new_stock=new_stock,
        movement_type="manual_adjustment",
        reason=reason.strip(),
        changed_by_user_id=admin.id
    )

    db.add(movement)

    try:
        notified_count = handle_stock_increase(
            db,
            product,
            previous_stock,
            previous_availability
        )

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
        "previous_stock": previous_stock,
        "updated_stock": product.stock,
        "restock_notifications_sent": notified_count
    }


# --------------------------------------------------
# 13. UPDATE PRODUCT AVAILABILITY (ADMIN ONLY)
# --------------------------------------------------

@router.patch("/{product_id}/availability")
def update_product_availability(
    product_id: int,
    is_available: bool,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("products"))
):
    product = get_product_or_404(
        product_id,
        db
    )

    previous_stock = product.stock
    previous_availability = product.is_available

    product.is_available = is_available

    try:
        notified_count = handle_stock_increase(
            db,
            product,
            previous_stock,
            previous_availability
        )

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
        "is_available": product.is_available,
        "restock_notifications_sent": notified_count
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
    admin: User = Depends(require_section_access("products"))
):
    product = get_product_or_404(product_id, db)

    previous_stock = product.stock
    previous_availability = product.is_available

    update_data = updated_product.model_dump(exclude_unset=True)

    if not update_data:
        raise HTTPException(
            status_code=400,
            detail="No product information was provided"
        )

    # Validate that the selected brand exists
    if "brand_id" in update_data:
        brand_id = update_data["brand_id"]

        if brand_id is None:
            update_data["brand"] = None
        else:
            selected_brand = db.query(Brand).filter(
                Brand.id == brand_id
            ).first()

            if not selected_brand:
                raise HTTPException(
                    status_code=404,
                    detail="Selected brand not found"
                )

            update_data["brand"] = selected_brand.name

    # Validate non-nullable fields
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

    # Validate final price and MRP
    final_price = update_data.get("price", product.price)
    final_mrp = update_data.get("mrp", product.mrp)

    if final_mrp is not None and final_price > final_mrp:
        raise HTTPException(
            status_code=400,
            detail="Selling price cannot be greater than MRP"
        )

    # Track stock changes
    if (
        "stock" in update_data
        and update_data["stock"] != product.stock
    ):
        new_stock = update_data["stock"]

        movement = InventoryMovement(
            product_id=product.id,
            product_name=product.name,
            quantity_change=new_stock - previous_stock,
            previous_stock=previous_stock,
            new_stock=new_stock,
            movement_type="manual_adjustment",
            reason="Stock changed while editing product",
            changed_by_user_id=admin.id
        )

        db.add(movement)

    # Apply updates
    for field, value in update_data.items():
        setattr(product, field, value)

    try:
        notified_count = handle_stock_increase(
            db,
            product,
            previous_stock,
            previous_availability
        )

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
    admin: User = Depends(require_section_access("products"))
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
