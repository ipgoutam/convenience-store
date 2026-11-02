import os
import uuid
import shutil

from PIL import Image, UnidentifiedImageError

from fastapi import UploadFile, File, Request

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.product import Product
from app.schemas.product import ProductCreate, ProductResponse


router = APIRouter(
    prefix="/products",
    tags=["Products"]
)


# Upload product image
@router.post("/upload-image/")
def upload_product_image(
    request: Request,
    file: UploadFile = File(...)
):

    # Allow only image files
    allowed_types = ["image/jpeg", "image/png", "image/webp"]

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Only JPG, PNG and WEBP images are allowed"
        )


    # Validate file extension
    allowed_extensions = [".jpg", ".jpeg", ".png", ".webp"]

    extension = os.path.splitext(file.filename)[1].lower()

    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Invalid image file extension"
        )
    # Check image file size (maximum 5 MB)
    MAX_FILE_SIZE = 5 * 1024 * 1024

    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="Image size must not exceed 5 MB"
        )


    # Verify actual image content
    try:
        file.file.seek(0)

        image = Image.open(file.file)

        # Check image dimensions
        MAX_PIXELS = 20_000_000  # 20 megapixels

        if image.width * image.height > MAX_PIXELS:
            raise HTTPException(
                status_code=400,
                detail="Image dimensions are too large"
            )

        image.verify()

        allowed_formats = ["JPEG", "PNG", "WEBP"]

        if image.format not in allowed_formats:
            raise HTTPException(
                status_code=400,
                detail="Invalid image format"
            )

    except (UnidentifiedImageError, OSError):
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is not a valid image"
        )

    finally:
        file.file.seek(0)

    # Generate a unique filename
    filename = f"{uuid.uuid4()}{extension}"

    # Save image
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)

    file_path = os.path.join(upload_dir, filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    image_url = str(
        request.url_for("uploads", path=filename)
    )

    return {
        "message": "Image uploaded successfully",
        "image_url": image_url
    }



# Add a new product
@router.post("/", response_model=ProductResponse)
def create_product(
    product: ProductCreate,
    db: Session = Depends(get_db)
):

    new_product = Product(
        name=product.name,
        description=product.description,
        price=product.price,
        stock=product.stock,
        category=product.category,
        image_url=str(product.image_url) if product.image_url else None,
        discount_percentage=product.discount_percentage
    )

    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    return new_product

# Get all products
@router.get("/", response_model=list[ProductResponse])
def get_all_products(db: Session = Depends(get_db)):

    products = db.query(Product).all()

    return products

# Search products by name
@router.get("/search/", response_model=list[ProductResponse])
def search_products(
    name: str,
    db: Session = Depends(get_db)
):
    products = db.query(Product).filter(
        Product.name.ilike(f"%{name}%")
    ).all()

    return products


# Filter products by category
@router.get("/category/", response_model=list[ProductResponse])
def filter_products_by_category(
    category: str,
    db: Session = Depends(get_db)
):
    products = db.query(Product).filter(
        Product.category.ilike(category)
    ).all()

    return products



# Get available products
@router.get("/available/", response_model=list[ProductResponse])
def get_available_products(
    db: Session = Depends(get_db)
):
    products = db.query(Product).filter(
        Product.is_available == True
    ).all()

    return products



# Sort products by price
@router.get("/sort/", response_model=list[ProductResponse])
def sort_products(
    order: str = "asc",
    db: Session = Depends(get_db)
):
    if order == "asc":
        products = db.query(Product).order_by(
            Product.price.asc()
        ).all()

    elif order == "desc":
        products = db.query(Product).order_by(
            Product.price.desc()
        ).all()

    else:
        raise HTTPException(
            status_code=400,
            detail="Order must be 'asc' or 'desc'"
        )

    return products



# Filter products by price range
@router.get("/price-range/", response_model=list[ProductResponse])
def filter_products_by_price(
    min_price: float = 0,
    max_price: float = 1000,
    db: Session = Depends(get_db)
):
    if min_price < 0 or max_price < min_price:
        raise HTTPException(
            status_code=400,
            detail="Invalid price range"
        )

    products = db.query(Product).filter(
        Product.price >= min_price,
        Product.price <= max_price
    ).all()

    return products



# Get products with pagination
@router.get("/pagination/", response_model=list[ProductResponse])
def get_products_paginated(
    page: int = 1,
    limit: int = 5,
    db: Session = Depends(get_db)
):
    if page < 1 or limit < 1:
        raise HTTPException(
            status_code=400,
            detail="Page and limit must be greater than 0"
        )

    offset = (page - 1) * limit

    products = db.query(Product).offset(offset).limit(limit).all()

    return products



# Get products with low stock
@router.get("/low-stock/", response_model=list[ProductResponse])
def get_low_stock_products(
    threshold: int = 10,
    db: Session = Depends(get_db)
):
    if threshold < 0:
        raise HTTPException(
            status_code=400,
            detail="Threshold cannot be negative"
        )

    products = db.query(Product).filter(
        Product.stock <= threshold
    ).all()

    return products



# Update product stock
@router.patch("/{product_id}/stock")
def update_product_stock(
    product_id: int,
    quantity: int,
    db: Session = Depends(get_db)
):
    product = db.query(Product).filter(
        Product.id == product_id
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    if product.stock + quantity < 0:
        raise HTTPException(
            status_code=400,
            detail="Insufficient stock"
        )

    product.stock += quantity

    db.commit()
    db.refresh(product)

    return {
        "message": "Stock updated successfully",
        "product_id": product.id,
        "product_name": product.name,
        "updated_stock": product.stock
    }



# Update product availability
@router.patch("/{product_id}/availability")
def update_product_availability(
    product_id: int,
    is_available: bool,
    db: Session = Depends(get_db)
):
    product = db.query(Product).filter(
        Product.id == product_id
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    product.is_available = is_available

    db.commit()
    db.refresh(product)

    return {
        "message": "Product availability updated successfully",
        "product_id": product.id,
        "product_name": product.name,
        "is_available": product.is_available
    }



# Get product statistics
@router.get("/count/")
def get_product_count(
    db: Session = Depends(get_db)
):
    total_products = db.query(Product).count()

    available_products = db.query(Product).filter(
        Product.is_available == True
    ).count()

    unavailable_products = db.query(Product).filter(
        Product.is_available == False
    ).count()

    return {
        "total_products": total_products,
        "available_products": available_products,
        "unavailable_products": unavailable_products
    }


# Get product by ID
@router.get("/{product_id}", response_model=ProductResponse)
def get_product(
    product_id: int,
    db: Session = Depends(get_db)
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

# Update product
@router.put("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: int,
    product_data: ProductCreate,
    db: Session = Depends(get_db)
):

    product = db.query(Product).filter(
        Product.id == product_id
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    product.name = product_data.name
    product.description = product_data.description
    product.price = product_data.price
    product.stock = product_data.stock
    product.category = product_data.category
    product.image_url = (
        str(product_data.image_url)
        if product_data.image_url else None
    )
    product.discount_percentage = product_data.discount_percentage

    db.commit()
    db.refresh(product)

    return product

# Delete product
@router.delete("/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_db)
):

    product = db.query(Product).filter(
        Product.id == product_id
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    db.delete(product)
    db.commit()

    return {
        "message": "Product deleted successfully",
        "product_id": product_id
    }

