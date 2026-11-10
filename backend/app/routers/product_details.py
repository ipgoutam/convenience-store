
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import get_db

from app.models.product import Product
from app.models.product_image import ProductImage
from app.models.product_frequently_bought_together import (
    ProductFrequentlyBoughtTogether
)
from app.models.wishlist import Wishlist
from app.models.product_review import ProductReview
from app.models.stock_notification_subscription import (
    StockNotificationSubscription
)
from app.models.recently_viewed import RecentlyViewed

from app.models.user import User
from app.models.order import Order
from app.models.order_item import OrderItem

from app.routers.auth import (
    get_current_user,
    require_section_access
)

from app.schemas.product_details import (
    ProductImageResponse,
    ProductImageReorderRequest,
    FrequentlyBoughtTogetherRequest,
    WishlistSyncRequest,
    ProductReviewCreate,
    ProductReviewModerationRequest,
    RecentlyViewedSyncRequest
)

from app.schemas.product import ProductResponse

from app.services.notification_service import create_notification


router = APIRouter(
    prefix="/product-details",
    tags=["Product Details"]
)


# --------------------------------------------------
# COMMON HELPERS
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


def get_utc_now():
    return datetime.now(timezone.utc)


# --------------------------------------------------
# 1. GET PRODUCT IMAGE GALLERY
# --------------------------------------------------

@router.get(
    "/{product_id}/images",
    response_model=list[ProductImageResponse]
)
def get_product_images(
    product_id: int,
    db: Session = Depends(get_db)
):
    product = get_product_or_404(product_id, db)

    images = db.query(ProductImage).filter(
        ProductImage.product_id == product_id
    ).order_by(
        ProductImage.display_order.asc(),
        ProductImage.id.asc()
    ).all()

    # Preserve compatibility with products that only
    # have the original image_url field.
    if not images and product.image_url:
        return [
            {
                "id": 0,
                "product_id": product.id,
                "image_url": product.image_url,
                "display_order": 0
            }
        ]

    return images


# --------------------------------------------------
# 2. ADD PRODUCT IMAGE (ADMIN ONLY)
# --------------------------------------------------

@router.post("/{product_id:int}/images", status_code=201)
def add_product_image(
    product_id: int,
    image_url: str = Query(..., min_length=1, max_length=500),
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("products"))
):
    product = get_product_or_404(product_id, db)

    existing_images = db.query(ProductImage).filter(
        ProductImage.product_id == product_id
    ).order_by(
        ProductImage.display_order.asc(),
        ProductImage.id.asc()
    ).all()

    total_images = len(existing_images)

    if not existing_images and product.image_url:
        total_images = 1

    if total_images >= 8:
        raise HTTPException(
            status_code=400,
            detail="A product can have a maximum of 8 images"
        )

    if not existing_images and product.image_url:
        db.add(
            ProductImage(
                product_id=product_id,
                image_url=product.image_url,
                display_order=0
            )
        )
        db.flush()

        next_order = 1
    else:
        next_order = max(
            (image.display_order for image in existing_images),
            default=-1
        ) + 1

    new_image = ProductImage(
        product_id=product_id,
        image_url=image_url.strip(),
        display_order=next_order
    )

    db.add(new_image)

    try:
        db.flush()

        first_image = db.query(ProductImage).filter(
            ProductImage.product_id == product_id
        ).order_by(
            ProductImage.display_order.asc(),
            ProductImage.id.asc()
        ).first()

        product.image_url = first_image.image_url if first_image else None

        db.commit()
        db.refresh(new_image)

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not add product image"
        )

    return {
        "message": "Product image added successfully",
        "image": {
            "id": new_image.id,
            "product_id": new_image.product_id,
            "image_url": new_image.image_url,
            "display_order": new_image.display_order
        }
    }

# --------------------------------------------------
# 3. DELETE PRODUCT IMAGE (ADMIN ONLY)
# --------------------------------------------------

@router.delete("/images/{image_id}")
def delete_product_image(
    image_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("products"))
):
    image = db.query(ProductImage).filter(
        ProductImage.id == image_id
    ).first()

    if not image:
        raise HTTPException(
            status_code=404,
            detail="Product image not found"
        )

    product = get_product_or_404(image.product_id, db)
    product_id = image.product_id

    try:
        db.delete(image)
        db.flush()

        remaining_images = db.query(ProductImage).filter(
            ProductImage.product_id == product_id
        ).order_by(
            ProductImage.display_order.asc(),
            ProductImage.id.asc()
        ).all()

        for position, remaining_image in enumerate(remaining_images):
            remaining_image.display_order = position

        product.image_url = (
            remaining_images[0].image_url
            if remaining_images else None
        )

        db.commit()

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not delete product image"
        )

    return {
        "message": "Product image deleted successfully"
    }

# --------------------------------------------------
# 4. REORDER PRODUCT IMAGES (ADMIN ONLY)
# --------------------------------------------------

@router.put("/{product_id:int}/images/reorder")
def reorder_product_images(
    product_id: int,
    request: ProductImageReorderRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("products"))
):
    product = get_product_or_404(product_id, db)

    submitted_ids = [
        image.id for image in request.images
    ]

    if len(submitted_ids) != len(set(submitted_ids)):
        raise HTTPException(
            status_code=400,
            detail="Duplicate image IDs are not allowed"
        )

    existing_images = db.query(ProductImage).filter(
        ProductImage.product_id == product_id
    ).all()

    existing_ids = {
        image.id for image in existing_images
    }

    if set(submitted_ids) != existing_ids:
        raise HTTPException(
            status_code=400,
            detail="Please provide every image belonging to this product"
        )

    images_by_id = {
        image.id: image for image in existing_images
    }

    try:
        ordered_items = sorted(
            request.images,
            key=lambda item: item.display_order
        )

        for position, item in enumerate(ordered_items):
            images_by_id[item.id].display_order = position

        db.flush()

        first_image = db.query(ProductImage).filter(
            ProductImage.product_id == product_id
        ).order_by(
            ProductImage.display_order.asc(),
            ProductImage.id.asc()
        ).first()

        product.image_url = first_image.image_url if first_image else None

        db.commit()

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not reorder product images"
        )

    return {
        "message": "Product images reordered successfully"
    }

# --------------------------------------------------
# 5. GET FREQUENTLY BOUGHT TOGETHER PRODUCTS
# --------------------------------------------------

@router.get(
    "/{product_id}/frequently-bought-together",
    response_model=list[ProductResponse]
)
def get_frequently_bought_together(
    product_id: int,
    db: Session = Depends(get_db)
):
    product = get_product_or_404(product_id, db)

    configured = db.query(
        ProductFrequentlyBoughtTogether
    ).filter(
        ProductFrequentlyBoughtTogether.product_id == product_id
    ).order_by(
        ProductFrequentlyBoughtTogether.display_order.asc(),
        ProductFrequentlyBoughtTogether.id.asc()
    ).all()

    if configured:
        related_ids = [
            item.related_product_id
            for item in configured
        ]

        products_by_id = {
            item.id: item
            for item in db.query(Product).filter(
                Product.id.in_(related_ids),
                Product.id != product_id
            ).all()
        }

        # Preserve admin-selected order.
        return [
            products_by_id[related_id]
            for related_id in related_ids
            if related_id in products_by_id
        ]

    # Automatic same-category fallback.
    return db.query(Product).filter(
        Product.category.ilike(product.category),
        Product.id != product_id,
        Product.is_available == True,
        Product.stock > 0
    ).order_by(
        Product.name.asc()
    ).limit(8).all()


# --------------------------------------------------
# 6. SAVE FREQUENTLY BOUGHT TOGETHER PRODUCTS
# ADMIN ONLY
# --------------------------------------------------

@router.put("/{product_id}/frequently-bought-together")
def save_frequently_bought_together(
    product_id: int,
    request: FrequentlyBoughtTogetherRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("products"))
):
    get_product_or_404(product_id, db)

    product_ids = request.product_ids

    if product_id in product_ids:
        raise HTTPException(
            status_code=400,
            detail="A product cannot be recommended with itself"
        )

    if len(product_ids) != len(set(product_ids)):
        raise HTTPException(
            status_code=400,
            detail="Duplicate product IDs are not allowed"
        )

    if product_ids:
        valid_ids = {
            item.id
            for item in db.query(Product.id).filter(
                Product.id.in_(product_ids)
            ).all()
        }

        if valid_ids != set(product_ids):
            raise HTTPException(
                status_code=400,
                detail="One or more selected products do not exist"
            )

    try:
        db.query(
            ProductFrequentlyBoughtTogether
        ).filter(
            ProductFrequentlyBoughtTogether.product_id == product_id
        ).delete(synchronize_session=False)

        for position, related_id in enumerate(product_ids):
            db.add(
                ProductFrequentlyBoughtTogether(
                    product_id=product_id,
                    related_product_id=related_id,
                    display_order=position
                )
            )

        db.commit()

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not save frequently bought together products"
        )

    return {
        "message": "Frequently Bought Together products saved",
        "product_ids": product_ids
    }


# --------------------------------------------------
# 7. GET CUSTOMER WISHLIST
# --------------------------------------------------

@router.get("/wishlist")
def get_wishlist(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    entries = db.query(Wishlist).filter(
        Wishlist.user_id == current_user.id
    ).order_by(
        Wishlist.created_at.desc()
    ).all()

    product_ids = [
        entry.product_id for entry in entries
    ]

    if not product_ids:
        return []

    products_by_id = {
        product.id: product
        for product in db.query(Product).filter(
            Product.id.in_(product_ids)
        ).all()
    }

    return [
        products_by_id[product_id]
        for product_id in product_ids
        if product_id in products_by_id
    ]


# --------------------------------------------------
# 8. ADD PRODUCT TO WISHLIST
# --------------------------------------------------

@router.post("/wishlist/{product_id}")
def add_to_wishlist(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_product_or_404(product_id, db)

    existing = db.query(Wishlist).filter(
        Wishlist.user_id == current_user.id,
        Wishlist.product_id == product_id
    ).first()

    if existing:
        return {
            "message": "Product is already in your wishlist"
        }

    db.add(
        Wishlist(
            user_id=current_user.id,
            product_id=product_id
        )
    )

    try:
        db.commit()

    except IntegrityError:
        db.rollback()

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not add product to wishlist"
        )

    return {
        "message": "Product added to wishlist"
    }


# --------------------------------------------------
# 9. REMOVE PRODUCT FROM WISHLIST
# --------------------------------------------------

@router.delete("/wishlist/{product_id}")
def remove_from_wishlist(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db.query(Wishlist).filter(
        Wishlist.user_id == current_user.id,
        Wishlist.product_id == product_id
    ).delete(synchronize_session=False)

    db.commit()

    return {
        "message": "Product removed from wishlist"
    }


# --------------------------------------------------
# 10. SYNC GUEST WISHLIST AFTER LOGIN
# --------------------------------------------------

@router.post("/wishlist/sync")
def sync_wishlist(
    request: WishlistSyncRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    product_ids = list(dict.fromkeys(request.product_ids))

    if product_ids:
        valid_ids = {
            item.id
            for item in db.query(Product.id).filter(
                Product.id.in_(product_ids)
            ).all()
        }

        for product_id in product_ids:
            if product_id in valid_ids:
                exists = db.query(Wishlist).filter(
                    Wishlist.user_id == current_user.id,
                    Wishlist.product_id == product_id
                ).first()

                if not exists:
                    db.add(
                        Wishlist(
                            user_id=current_user.id,
                            product_id=product_id
                        )
                    )

    try:
        db.commit()

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not synchronize wishlist"
        )

    return {
        "message": "Wishlist synchronized successfully"
    }


# --------------------------------------------------
# 13. SYNC GUEST RECENTLY VIEWED PRODUCTS
# --------------------------------------------------

@router.post("/recently-viewed/sync")
def sync_recently_viewed(
    request: RecentlyViewedSyncRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Incoming order is newest first.
    product_ids = list(dict.fromkeys(request.product_ids))[:8]

    valid_ids = {
        item.id
        for item in db.query(Product.id).filter(
            Product.id.in_(product_ids)
        ).all()
    }

    now = get_utc_now()

    # Process oldest to newest so the newest items
    # receive the latest timestamps.
    for index, product_id in enumerate(reversed(product_ids)):

        if product_id not in valid_ids:
            continue

        entry = db.query(RecentlyViewed).filter(
            RecentlyViewed.user_id == current_user.id,
            RecentlyViewed.product_id == product_id
        ).first()

        viewed_time = now + timedelta(microseconds=index)

        if entry:
            entry.viewed_at = viewed_time
        else:
            db.add(
                RecentlyViewed(
                    user_id=current_user.id,
                    product_id=product_id,
                    viewed_at=viewed_time
                )
            )

    try:
        db.flush()

        old_entries = db.query(RecentlyViewed).filter(
            RecentlyViewed.user_id == current_user.id
        ).order_by(
            RecentlyViewed.viewed_at.desc(),
            RecentlyViewed.id.desc()
        ).offset(8).all()

        for old_entry in old_entries:
            db.delete(old_entry)

        db.commit()

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not synchronize recently viewed products"
        )

    return {
        "message": "Recently viewed products synchronized successfully"
    }


# --------------------------------------------------
# 11. RECORD RECENTLY VIEWED PRODUCT
# --------------------------------------------------

@router.post("/recently-viewed/{product_id}")
def record_recently_viewed(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_product_or_404(product_id, db)

    entry = db.query(RecentlyViewed).filter(
        RecentlyViewed.user_id == current_user.id,
        RecentlyViewed.product_id == product_id
    ).first()

    now = get_utc_now()

    if entry:
        entry.viewed_at = now
    else:
        db.add(
            RecentlyViewed(
                user_id=current_user.id,
                product_id=product_id,
                viewed_at=now
            )
        )

    try:
        db.flush()

        # Keep only the latest eight records.
        old_entries = db.query(RecentlyViewed).filter(
            RecentlyViewed.user_id == current_user.id
        ).order_by(
            RecentlyViewed.viewed_at.desc(),
            RecentlyViewed.id.desc()
        ).offset(8).all()

        for old_entry in old_entries:
            db.delete(old_entry)

        db.commit()

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not record recently viewed product"
        )

    return {
        "message": "Recently viewed product recorded"
    }


# --------------------------------------------------
# 12. GET RECENTLY VIEWED PRODUCTS
# --------------------------------------------------

@router.get(
    "/recently-viewed",
    response_model=list[ProductResponse]
)
def get_recently_viewed(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    entries = db.query(RecentlyViewed).filter(
        RecentlyViewed.user_id == current_user.id
    ).order_by(
        RecentlyViewed.viewed_at.desc(),
        RecentlyViewed.id.desc()
    ).limit(8).all()

    product_ids = [
        entry.product_id for entry in entries
    ]

    if not product_ids:
        return []

    products_by_id = {
        product.id: product
        for product in db.query(Product).filter(
            Product.id.in_(product_ids)
        ).all()
    }

    return [
        products_by_id[product_id]
        for product_id in product_ids
        if product_id in products_by_id
    ]


# --------------------------------------------------
# 14. CHECK VERIFIED PURCHASE
# --------------------------------------------------

def has_completed_purchase(
    db: Session,
    user_id: int,
    product_id: int
):
    return db.query(OrderItem).join(
        Order,
        OrderItem.order_id == Order.id
    ).filter(
        Order.customer_id == user_id,
        Order.order_status == "completed",
        OrderItem.product_id == product_id
    ).first() is not None


# --------------------------------------------------
# 15. GET PUBLIC PRODUCT REVIEWS
# --------------------------------------------------

@router.get("/{product_id}/reviews")
def get_product_reviews(
    product_id: int,
    db: Session = Depends(get_db)
):
    get_product_or_404(product_id, db)

    reviews = db.query(
        ProductReview,
        User.full_name
    ).join(
        User,
        User.id == ProductReview.user_id
    ).filter(
        ProductReview.product_id == product_id,
        ProductReview.status == "approved"
    ).order_by(
        ProductReview.created_at.desc()
    ).all()

    total_reviews = len(reviews)

    average_rating = (
        sum(review.rating for review, _ in reviews) / total_reviews
        if total_reviews else 0
    )

    return {
        "average_rating": round(average_rating, 1),
        "total_reviews": total_reviews,
        "reviews": [
            {
                "id": review.id,
                "user_id": review.user_id,
                "customer_name": full_name,
                "rating": review.rating,
                "review_text": review.review_text,
                "created_at": review.created_at,
                "updated_at": review.updated_at
            }
            for review, full_name in reviews
        ]
    }


# --------------------------------------------------
# 16. GET CURRENT CUSTOMER'S REVIEW
# --------------------------------------------------

@router.get("/{product_id}/reviews/my")
def get_my_product_review(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_product_or_404(product_id, db)

    review = db.query(ProductReview).filter(
        ProductReview.product_id == product_id,
        ProductReview.user_id == current_user.id
    ).first()

    if not review:
        return {
            "review": None,
            "can_review": has_completed_purchase(
                db,
                current_user.id,
                product_id
            )
        }

    return {
        "review": review,
        "can_review": True
    }


# --------------------------------------------------
# 17. CREATE OR UPDATE CUSTOMER REVIEW
# --------------------------------------------------

@router.post("/{product_id}/reviews")
def create_or_update_product_review(
    product_id: int,
    request: ProductReviewCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_product_or_404(product_id, db)

    if not has_completed_purchase(
        db,
        current_user.id,
        product_id
    ):
        raise HTTPException(
            status_code=403,
            detail="Only customers who purchased and completed an order for this product can review it"
        )

    review_text = (
        request.review_text.strip()
        if request.review_text
        else None
    )

    if review_text == "":
        review_text = None

    review = db.query(ProductReview).filter(
        ProductReview.user_id == current_user.id,
        ProductReview.product_id == product_id
    ).first()

    if review:
        review.rating = request.rating
        review.review_text = review_text

        # Updated reviews require approval again.
        review.status = "pending"
        review.moderated_by = None
        review.moderated_at = None

        message = "Review updated and submitted for approval"

    else:
        review = ProductReview(
            user_id=current_user.id,
            product_id=product_id,
            rating=request.rating,
            review_text=review_text,
            status="pending"
        )

        db.add(review)
        message = "Review submitted for approval"

    try:
        db.commit()
        db.refresh(review)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="You have already submitted a review for this product"
        )

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not save your review"
        )

    return {
        "message": message,
        "review": review
    }


# --------------------------------------------------
# 18. ADMIN: GET REVIEWS FOR MODERATION
# --------------------------------------------------

@router.get("/admin/reviews")
def get_reviews_for_moderation(
    status: str = Query(
        default="pending",
        pattern="^(pending|approved|rejected|hidden|all)$"
    ),
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("products"))
):
    query = db.query(
        ProductReview,
        User.full_name,
        Product.name
    ).join(
        User,
        User.id == ProductReview.user_id
    ).join(
        Product,
        Product.id == ProductReview.product_id
    )

    if status != "all":
        query = query.filter(
            ProductReview.status == status
        )

    results = query.order_by(
        ProductReview.created_at.desc()
    ).all()

    return [
        {
            "id": review.id,
            "user_id": review.user_id,
            "customer_name": customer_name,
            "product_id": review.product_id,
            "product_name": product_name,
            "rating": review.rating,
            "review_text": review.review_text,
            "status": review.status,
            "created_at": review.created_at,
            "updated_at": review.updated_at
        }
        for review, customer_name, product_name in results
    ]


# --------------------------------------------------
# 19. ADMIN: MODERATE REVIEW
# --------------------------------------------------

@router.patch("/admin/reviews/{review_id}")
def moderate_product_review(
    review_id: int,
    request: ProductReviewModerationRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("products"))
):
    review = db.query(ProductReview).filter(
        ProductReview.id == review_id
    ).first()

    if not review:
        raise HTTPException(
            status_code=404,
            detail="Review not found"
        )

    review.status = request.status
    review.moderated_by = admin.id
    review.moderated_at = get_utc_now()

    try:
        db.commit()
        db.refresh(review)

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not moderate review"
        )

    return {
        "message": "Review moderation updated successfully",
        "review_id": review.id,
        "status": review.status
    }


# --------------------------------------------------
# 20. SUBSCRIBE TO RESTOCK NOTIFICATION
# --------------------------------------------------

@router.post("/notify-me/{product_id}")
def subscribe_to_restock_notification(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    product = get_product_or_404(product_id, db)

    if product.stock > 0 and product.is_available:
        raise HTTPException(
            status_code=400,
            detail="This product is already in stock"
        )

    subscription = db.query(
        StockNotificationSubscription
    ).filter(
        StockNotificationSubscription.user_id == current_user.id,
        StockNotificationSubscription.product_id == product_id
    ).first()

    if subscription:
        if subscription.is_active:
            return {
                "message": "You are already subscribed to this product"
            }

        subscription.is_active = True
        subscription.notified_at = None

    else:
        subscription = StockNotificationSubscription(
            user_id=current_user.id,
            product_id=product_id,
            is_active=True
        )

        db.add(subscription)

    try:
        db.commit()

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Subscription already exists"
        )

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not subscribe to restock notification"
        )

    return {
        "message": "You will be notified when this product is back in stock"
    }


# --------------------------------------------------
# 21. CHECK RESTOCK SUBSCRIPTION STATUS
# --------------------------------------------------

@router.get("/notify-me/{product_id}/status")
def get_restock_subscription_status(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_product_or_404(product_id, db)

    subscription = db.query(
        StockNotificationSubscription
    ).filter(
        StockNotificationSubscription.user_id == current_user.id,
        StockNotificationSubscription.product_id == product_id,
        StockNotificationSubscription.is_active == True
    ).first()

    return {
        "subscribed": subscription is not None,
        "notified": (
            subscription.notified_at is not None
            if subscription else False
        )
    }


# --------------------------------------------------
# 22. CANCEL RESTOCK SUBSCRIPTION
# --------------------------------------------------

@router.delete("/notify-me/{product_id}")
def cancel_restock_subscription(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    subscription = db.query(
        StockNotificationSubscription
    ).filter(
        StockNotificationSubscription.user_id == current_user.id,
        StockNotificationSubscription.product_id == product_id,
        StockNotificationSubscription.is_active == True
    ).first()

    if subscription:
        subscription.is_active = False

        try:
            db.commit()

        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=500,
                detail="Could not cancel restock subscription"
            )

    return {
        "message": "Restock notification subscription cancelled"
    }
