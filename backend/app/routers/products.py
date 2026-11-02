
# import os
# import uuid
# import shutil

# from PIL import Image, UnidentifiedImageError

# from fastapi import (
#     APIRouter,
#     Depends,
#     HTTPException,
#     UploadFile,
#     File,
#     Request
# )
# from sqlalchemy.orm import Session

# from app.database import get_db
# from app.models.product import Product
# from app.schemas.product import ProductCreate, ProductResponse
# from app.routers.auth import require_admin


# router = APIRouter(
#     prefix="/products",
#     tags=["Products"]
# )



# # Upload product image
# @router.post("/upload-image/")
# def upload_product_image(
#     request: Request,
#     file: UploadFile = File(...)
# ):

#     # Allow only image files
#     allowed_types = ["image/jpeg", "image/png", "image/webp"]

#     if file.content_type not in allowed_types:
#         raise HTTPException(
#             status_code=400,
#             detail="Only JPG, PNG and WEBP images are allowed"
#         )


#     # Validate file extension
#     allowed_extensions = [".jpg", ".jpeg", ".png", ".webp"]

#     extension = os.path.splitext(file.filename)[1].lower()

#     if extension not in allowed_extensions:
#         raise HTTPException(
#             status_code=400,
#             detail="Invalid image file extension"
#         )
#     # Check image file size (maximum 5 MB)
#     MAX_FILE_SIZE = 5 * 1024 * 1024

#     file.file.seek(0, 2)
#     file_size = file.file.tell()
#     file.file.seek(0)

#     if file_size > MAX_FILE_SIZE:
#         raise HTTPException(
#             status_code=400,
#             detail="Image size must not exceed 5 MB"
#         )


#     # Verify actual image content
#     try:
#         file.file.seek(0)

#         image = Image.open(file.file)

#         # Check image dimensions
#         MAX_PIXELS = 20_000_000  # 20 megapixels

#         if image.width * image.height > MAX_PIXELS:
#             raise HTTPException(
#                 status_code=400,
#                 detail="Image dimensions are too large"
#             )

#         image.verify()

#         allowed_formats = ["JPEG", "PNG", "WEBP"]

#         if image.format not in allowed_formats:
#             raise HTTPException(
#                 status_code=400,
#                 detail="Invalid image format"
#             )

#     except (UnidentifiedImageError, OSError):
#         raise HTTPException(
#             status_code=400,
#             detail="Uploaded file is not a valid image"
#         )

#     finally:
#         file.file.seek(0)

#     # Generate a unique filename
#     filename = f"{uuid.uuid4()}{extension}"

#     # Save image
#     upload_dir = "uploads"
#     os.makedirs(upload_dir, exist_ok=True)

#     file_path = os.path.join(upload_dir, filename)

#     with open(file_path, "wb") as buffer:
#         shutil.copyfileobj(file.file, buffer)

#     image_url = str(
#         request.url_for("uploads", path=filename)
#     )

#     return {
#         "message": "Image uploaded successfully",
#         "image_url": image_url
#     }



# # Add a new product
# @router.post("/", response_model=ProductResponse)
# def create_product(
#     product: ProductCreate,
#     db: Session = Depends(get_db)
# ):

#     new_product = Product(
#         name=product.name,
#         description=product.description,
#         price=product.price,
#         stock=product.stock,
#         category=product.category,
#         image_url=str(product.image_url) if product.image_url else None,
#         discount_percentage=product.discount_percentage
#     )

#     db.add(new_product)
#     db.commit()
#     db.refresh(new_product)

#     return new_product

# # Get all products
# @router.get("/", response_model=list[ProductResponse])
# def get_all_products(db: Session = Depends(get_db)):

#     products = db.query(Product).all()

#     return products

# # Search products by name
# @router.get("/search/", response_model=list[ProductResponse])
# def search_products(
#     name: str,
#     db: Session = Depends(get_db)
# ):
#     products = db.query(Product).filter(
#         Product.name.ilike(f"%{name}%")
#     ).all()

#     return products


# # Filter products by category
# @router.get("/category/", response_model=list[ProductResponse])
# def filter_products_by_category(
#     category: str,
#     db: Session = Depends(get_db)
# ):
#     products = db.query(Product).filter(
#         Product.category.ilike(category)
#     ).all()

#     return products



# # Get available products
# @router.get("/available/", response_model=list[ProductResponse])
# def get_available_products(
#     db: Session = Depends(get_db)
# ):
#     products = db.query(Product).filter(
#         Product.is_available == True
#     ).all()

#     return products



# # Sort products by price
# @router.get("/sort/", response_model=list[ProductResponse])
# def sort_products(
#     order: str = "asc",
#     db: Session = Depends(get_db)
# ):
#     if order == "asc":
#         products = db.query(Product).order_by(
#             Product.price.asc()
#         ).all()

#     elif order == "desc":
#         products = db.query(Product).order_by(
#             Product.price.desc()
#         ).all()

#     else:
#         raise HTTPException(
#             status_code=400,
#             detail="Order must be 'asc' or 'desc'"
#         )

#     return products



# # Filter products by price range
# @router.get("/price-range/", response_model=list[ProductResponse])
# def filter_products_by_price(
#     min_price: float = 0,
#     max_price: float = 1000,
#     db: Session = Depends(get_db)
# ):
#     if min_price < 0 or max_price < min_price:
#         raise HTTPException(
#             status_code=400,
#             detail="Invalid price range"
#         )

#     products = db.query(Product).filter(
#         Product.price >= min_price,
#         Product.price <= max_price
#     ).all()

#     return products



# # Get products with pagination
# @router.get("/pagination/", response_model=list[ProductResponse])
# def get_products_paginated(
#     page: int = 1,
#     limit: int = 5,
#     db: Session = Depends(get_db)
# ):
#     if page < 1 or limit < 1:
#         raise HTTPException(
#             status_code=400,
#             detail="Page and limit must be greater than 0"
#         )

#     offset = (page - 1) * limit

#     products = db.query(Product).offset(offset).limit(limit).all()

#     return products



# # Get products with low stock
# @router.get("/low-stock/", response_model=list[ProductResponse])
# def get_low_stock_products(
#     threshold: int = 10,
#     db: Session = Depends(get_db)
# ):
#     if threshold < 0:
#         raise HTTPException(
#             status_code=400,
#             detail="Threshold cannot be negative"
#         )

#     products = db.query(Product).filter(
#         Product.stock <= threshold
#     ).all()

#     return products



# # Update product stock
# @router.patch("/{product_id}/stock")
# def update_product_stock(
#     product_id: int,
#     quantity: int,
#     db: Session = Depends(get_db)
# ):
#     product = db.query(Product).filter(
#         Product.id == product_id
#     ).first()

#     if not product:
#         raise HTTPException(
#             status_code=404,
#             detail="Product not found"
#         )

#     if product.stock + quantity < 0:
#         raise HTTPException(
#             status_code=400,
#             detail="Insufficient stock"
#         )

#     product.stock += quantity

#     db.commit()
#     db.refresh(product)

#     return {
#         "message": "Stock updated successfully",
#         "product_id": product.id,
#         "product_name": product.name,
#         "updated_stock": product.stock
#     }



# # Update product availability
# @router.patch("/{product_id}/availability")
# def update_product_availability(
#     product_id: int,
#     is_available: bool,
#     db: Session = Depends(get_db)
# ):
#     product = db.query(Product).filter(
#         Product.id == product_id
#     ).first()

#     if not product:
#         raise HTTPException(
#             status_code=404,
#             detail="Product not found"
#         )

#     product.is_available = is_available

#     db.commit()
#     db.refresh(product)

#     return {
#         "message": "Product availability updated successfully",
#         "product_id": product.id,
#         "product_name": product.name,
#         "is_available": product.is_available
#     }



# # Get product statistics
# @router.get("/count/")
# def get_product_count(
#     db: Session = Depends(get_db)
# ):
#     total_products = db.query(Product).count()

#     available_products = db.query(Product).filter(
#         Product.is_available == True
#     ).count()

#     unavailable_products = db.query(Product).filter(
#         Product.is_available == False
#     ).count()

#     return {
#         "total_products": total_products,
#         "available_products": available_products,
#         "unavailable_products": unavailable_products
#     }


# # Get product by ID
# @router.get("/{product_id}", response_model=ProductResponse)
# def get_product(
#     product_id: int,
#     db: Session = Depends(get_db)
# ):

#     product = db.query(Product).filter(
#         Product.id == product_id
#     ).first()

#     if not product:
#         raise HTTPException(
#             status_code=404,
#             detail="Product not found"
#         )

#     return product

# # Update product
# @router.put("/{product_id}", response_model=ProductResponse)
# def update_product(
#     product_id: int,
#     product_data: ProductCreate,
#     db: Session = Depends(get_db)
# ):

#     product = db.query(Product).filter(
#         Product.id == product_id
#     ).first()

#     if not product:
#         raise HTTPException(
#             status_code=404,
#             detail="Product not found"
#         )

#     product.name = product_data.name
#     product.description = product_data.description
#     product.price = product_data.price
#     product.stock = product_data.stock
#     product.category = product_data.category
#     product.image_url = (
#         str(product_data.image_url)
#         if product_data.image_url else None
#     )
#     product.discount_percentage = product_data.discount_percentage

#     db.commit()
#     db.refresh(product)

#     return product

# # Delete product
# @router.delete("/{product_id}")
# def delete_product(
#     product_id: int,
#     db: Session = Depends(get_db)
# ):

#     product = db.query(Product).filter(
#         Product.id == product_id
#     ).first()

#     if not product:
#         raise HTTPException(
#             status_code=404,
#             detail="Product not found"
#         )

#     db.delete(product)
#     db.commit()

#     return {
#         "message": "Product deleted successfully",
#         "product_id": product_id
#     }



import os
import uuid
from PIL import Image, UnidentifiedImageError

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Request
)
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.product import Product
from app.models.user import User
from app.schemas.product import ProductCreate, ProductResponse
from app.routers.auth import require_admin


router = APIRouter(
    prefix="/products",
    tags=["Products"]
)

UPLOAD_DIR = "uploads"
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
MAX_IMAGE_PIXELS = 20_000_000

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}

EXTENSION_FORMATS = {
    ".jpg": "JPEG",
    ".jpeg": "JPEG",
    ".png": "PNG",
    ".webp": "WEBP"
}


# --------------------------------------------------
# 1. UPLOAD PRODUCT IMAGE (ADMIN ONLY)
# --------------------------------------------------

@router.post("/upload-image/")
def upload_product_image(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    extension = os.path.splitext(file.filename or "")[1].lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only JPG, JPEG, PNG and WEBP images are allowed"
        )

    if file.content_type not in {
        "image/jpeg",
        "image/png",
        "image/webp"
    }:
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

    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is not a valid image"
        )

    finally:
        file.file.seek(0)

    os.makedirs(UPLOAD_DIR, exist_ok=True)

    filename = f"{uuid.uuid4().hex}{extension}"
    file_path = os.path.join(UPLOAD_DIR, filename)

    try:
        with open(file_path, "wb") as buffer:
            while chunk := file.file.read(1024 * 1024):
                buffer.write(chunk)

    except OSError:
        raise HTTPException(
            status_code=500,
            detail="Could not save image"
        )

    finally:
        file.file.close()

    image_url = str(request.url_for("uploads", path=filename))

    return {
        "message": "Image uploaded successfully",
        "image_url": image_url
    }


# --------------------------------------------------
# 2. CREATE PRODUCT (ADMIN ONLY)
# --------------------------------------------------

@router.post("/", response_model=ProductResponse)
def create_product(
    product: ProductCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    new_product = Product(**product.model_dump())

    db.add(new_product)

    try:
        db.commit()
        db.refresh(new_product)
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

@router.get("/", response_model=list[ProductResponse])
def get_all_products(db: Session = Depends(get_db)):
    return db.query(Product).all()


# --------------------------------------------------
# 4. SEARCH PRODUCTS (PUBLIC)
# --------------------------------------------------

@router.get("/search/", response_model=list[ProductResponse])
def search_products(
    name: str,
    db: Session = Depends(get_db)
):
    return db.query(Product).filter(
        Product.name.ilike(f"%{name}%")
    ).all()


# --------------------------------------------------
# 5. FILTER BY CATEGORY (PUBLIC)
# --------------------------------------------------

@router.get("/category/", response_model=list[ProductResponse])
def get_products_by_category(
    category: str,
    db: Session = Depends(get_db)
):
    return db.query(Product).filter(
        Product.category.ilike(category)
    ).all()


# --------------------------------------------------
# 6. AVAILABLE PRODUCTS (PUBLIC)
# --------------------------------------------------

@router.get("/available/", response_model=list[ProductResponse])
def get_available_products(db: Session = Depends(get_db)):
    return db.query(Product).filter(
        Product.is_available == True
    ).all()


# --------------------------------------------------
# 7. SORT PRODUCTS (PUBLIC)
# --------------------------------------------------

@router.get("/sort/", response_model=list[ProductResponse])
def sort_products(
    order: str = "asc",
    db: Session = Depends(get_db)
):
    if order.lower() not in ["asc", "desc"]:
        raise HTTPException(
            status_code=400,
            detail="Order must be asc or desc"
        )

    if order.lower() == "asc":
        return db.query(Product).order_by(Product.price.asc()).all()

    return db.query(Product).order_by(Product.price.desc()).all()


# --------------------------------------------------
# 8. FILTER BY PRICE RANGE (PUBLIC)
# --------------------------------------------------

@router.get("/price-range/", response_model=list[ProductResponse])
def filter_by_price(
    min_price: float,
    max_price: float,
    db: Session = Depends(get_db)
):
    if min_price < 0 or max_price < min_price:
        raise HTTPException(
            status_code=400,
            detail="Invalid price range"
        )

    return db.query(Product).filter(
        Product.price >= min_price,
        Product.price <= max_price
    ).all()


# --------------------------------------------------
# 9. PAGINATION (PUBLIC)
# --------------------------------------------------

@router.get("/pagination/", response_model=list[ProductResponse])
def get_products_paginated(
    page: int = 1,
    limit: int = 10,
    db: Session = Depends(get_db)
):
    if page < 1 or limit < 1 or limit > 100:
        raise HTTPException(
            status_code=400,
            detail="Page must be positive and limit must be between 1 and 100"
        )

    skip = (page - 1) * limit

    return db.query(Product).offset(skip).limit(limit).all()


# --------------------------------------------------
# 10. LOW STOCK PRODUCTS (ADMIN ONLY)
# --------------------------------------------------

@router.get("/low-stock/", response_model=list[ProductResponse])
def get_low_stock_products(
    threshold: int = 10,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    if threshold < 0:
        raise HTTPException(
            status_code=400,
            detail="Threshold cannot be negative"
        )

    return db.query(Product).filter(
        Product.stock <= threshold
    ).all()


# --------------------------------------------------
# 11. PRODUCT COUNT (ADMIN ONLY)
# --------------------------------------------------

@router.get("/count/")
def get_product_count(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    total = db.query(Product).count()

    available = db.query(Product).filter(
        Product.is_available == True
    ).count()

    return {
        "total_products": total,
        "available_products": available,
        "unavailable_products": total - available
    }


# --------------------------------------------------
# 12. UPDATE STOCK (ADMIN ONLY)
# --------------------------------------------------

@router.patch("/{product_id}/stock")
def update_product_stock(
    product_id: int,
    quantity: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    product = db.query(Product).filter(
        Product.id == product_id
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    new_stock = product.stock + quantity

    if new_stock < 0:
        raise HTTPException(
            status_code=400,
            detail="Stock cannot become negative"
        )

    product.stock = new_stock
    db.commit()
    db.refresh(product)

    return {
        "message": "Stock updated successfully",
        "product_id": product.id,
        "stock": product.stock
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
        "message": "Product availability updated",
        "is_available": product.is_available
    }


# --------------------------------------------------
# 14. GET PRODUCT BY ID (PUBLIC)
# --------------------------------------------------

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


# --------------------------------------------------
# 15. UPDATE PRODUCT (ADMIN ONLY)
# --------------------------------------------------

@router.put("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: int,
    updated_product: ProductCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    product = db.query(Product).filter(
        Product.id == product_id
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    for key, value in updated_product.model_dump().items():
        setattr(product, key, value)

    try:
        db.commit()
        db.refresh(product)
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
    product = db.query(Product).filter(
        Product.id == product_id
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
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
        "message": "Product deleted successfully"
    }
