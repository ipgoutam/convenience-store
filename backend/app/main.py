
import os
from contextlib import asynccontextmanager
from datetime import time
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, Depends
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import Base, engine, get_db, SessionLocal
from app.services import notification_service

# --------------------------------------------------
# IMPORT ALL DATABASE MODELS
# --------------------------------------------------

from app.models.category import Category
from app.models.product import Product
from app.models.user import User
from app.models.refresh_token import RefreshToken
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.store_setting import StoreSetting
from app.models.address import Address
from app.models.coupon import Coupon
from app.models.cart import Cart, CartItem
from app.models.payment import Payment
from app.models.notification import Notification
from app.models.admin_invite import AdminInvite
from app.models.refund_attempt import RefundAttempt
from app.models.inventory_movement import InventoryMovement
from app.models.brand import Brand
from app.models.notification_preference import NotificationPreference
from app.models.notification_delivery import NotificationDelivery
from app.models.password_reset_otp import PasswordResetOTP
from app.models.product_image import ProductImage
from app.models.product_frequently_bought_together import ProductFrequentlyBoughtTogether
from app.models.wishlist import Wishlist
from app.models.product_review import ProductReview
from app.models.stock_notification_subscription import StockNotificationSubscription
from app.models.recently_viewed import RecentlyViewed

# --------------------------------------------------
# IMPORT ALL ROUTERS
# --------------------------------------------------

from app.routers.products import router as products_router
from app.routers.category import router as category_router
from app.routers.auth import router as auth_router
from app.routers.orders import router as orders_router
from app.routers.store_setting import router as store_setting_router
from app.routers.address import router as address_router
from app.routers.customers import router as customers_router
from app.routers.coupons import router as coupons_router
from app.routers.cart import router as cart_router
from app.routers.payments import router as payments_router
from app.routers.notifications import router as notifications_router
from app.routers.dashboard import router as dashboard_router
from app.routers.admin_management import router as admin_management_router
from app.routers.inventory import router as inventory_router
from app.routers.brands import router as brands_router
from app.routers.homepage import router as homepage_router
from app.routers import admin_notifications
from app.routers import notification_deliveries
from app.routers import product_details

# --------------------------------------------------
# UPLOAD DIRECTORY
# --------------------------------------------------

from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = str(BACKEND_DIR / "uploads")

os.makedirs(UPLOAD_DIR, exist_ok=True)


# --------------------------------------------------
# INITIALIZE DEFAULT STORE SETTINGS
# --------------------------------------------------

def initialize_store_settings():
    db = SessionLocal()

    try:
        settings = db.query(StoreSetting).first()

        if not settings:
            default_settings = StoreSetting(
                store_name="Convenience Store",
                opening_time=time(7, 0),
                closing_time=time(22, 0),
                is_open=True,
                delivery_fee=0
            )

            db.add(default_settings)
            db.commit()

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


# --------------------------------------------------
# APPLICATION LIFESPAN
# --------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):

    # Create tables that do not already exist.
    Base.metadata.create_all(bind=engine)

    # Initialize default store settings.
    initialize_store_settings()

    yield


# --------------------------------------------------
# CREATE FASTAPI APPLICATION
# --------------------------------------------------

app = FastAPI(
    title="Convenience Store API",
    description="Backend for our convenience store",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# --------------------------------------------------
# STATIC IMAGE UPLOADS
# --------------------------------------------------

app.mount(
    "/uploads",
    StaticFiles(directory=UPLOAD_DIR),
    name="uploads"
)


# --------------------------------------------------
# REGISTER API ROUTERS
# --------------------------------------------------

app.include_router(products_router)
app.include_router(category_router)
app.include_router(auth_router)
app.include_router(orders_router)
app.include_router(store_setting_router)
app.include_router(address_router)
app.include_router(customers_router)
app.include_router(coupons_router)
app.include_router(cart_router)
app.include_router(payments_router)
app.include_router(notifications_router)
app.include_router(dashboard_router)
app.include_router(admin_management_router)
app.include_router(inventory_router)
app.include_router(brands_router)
app.include_router(homepage_router)
app.include_router(admin_notifications.router)
app.include_router(notification_deliveries.router)
app.include_router(product_details.router)
# --------------------------------------------------
# HOME ENDPOINT
# --------------------------------------------------

@app.get("/")
def home():
    return {
        "message": "Welcome to Convenience Store API",
        "status": "Running"
    }


# --------------------------------------------------
# DATABASE CONNECTION CHECK
# --------------------------------------------------

@app.get("/db-check")
def database_check(db: Session = Depends(get_db)):

    db.execute(text("SELECT 1"))

    return {
        "message": "PostgreSQL connected successfully!",
        "database": "convenience_store",
        "status": "Connected"
    }
