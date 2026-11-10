
from typing import Literal

from pydantic import BaseModel, Field, ConfigDict


# --------------------------------------------------
# PRODUCT IMAGES
# --------------------------------------------------

class ProductImageResponse(BaseModel):
    id: int
    product_id: int
    image_url: str
    display_order: int

    model_config = ConfigDict(from_attributes=True)


class ProductImageReorderItem(BaseModel):
    id: int
    display_order: int = Field(ge=0)


class ProductImageReorderRequest(BaseModel):
    images: list[ProductImageReorderItem] = Field(
        min_length=1,
        max_length=8
    )


# --------------------------------------------------
# FREQUENTLY BOUGHT TOGETHER
# --------------------------------------------------

class FrequentlyBoughtTogetherRequest(BaseModel):
    product_ids: list[int] = Field(max_length=20)


# --------------------------------------------------
# WISHLIST
# --------------------------------------------------

class WishlistSyncRequest(BaseModel):
    product_ids: list[int] = Field(max_length=500)


# --------------------------------------------------
# PRODUCT REVIEWS
# --------------------------------------------------

class ProductReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    review_text: str | None = Field(
        default=None,
        max_length=2000
    )


class ProductReviewResponse(BaseModel):
    id: int
    user_id: int
    product_id: int
    rating: int
    review_text: str | None
    status: str
    created_at: object
    updated_at: object

    model_config = ConfigDict(from_attributes=True)


class ProductReviewModerationRequest(BaseModel):
    status: Literal["approved", "rejected", "hidden"]


# --------------------------------------------------
# RECENTLY VIEWED
# --------------------------------------------------

class RecentlyViewedSyncRequest(BaseModel):
    product_ids: list[int] = Field(
        max_length=8
    )
