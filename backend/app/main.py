
import os
from datetime import time

from fastapi import FastAPI, Depends
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import Base, engine, get_db, SessionLocal

# Import all database models
from app.models.category import Category
from app.models.product import Product
from app.models.user import User
from app.models.refresh_token import RefreshToken
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.store_setting import StoreSetting
from app.models.address import Address
from app.models.coupon import Coupon


# Import routers
from app.routers.products import router as products_router
from app.routers.category import router as category_router
from app.routers.auth import router as auth_router
from app.routers.orders import router as orders_router
from app.routers.store_setting import router as store_setting_router
from app.routers.address import router as address_router
from app.routers.customers import router as customers_router
from app.routers.coupons import router as coupons_router


# Create database tables
Base.metadata.create_all(bind=engine)


# Initialize default store settings
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


initialize_store_settings()


# Create FastAPI application
app = FastAPI(
    title="Convenience Store API",
    description="Backend for our convenience store",
    version="1.0.0"
)


# Static image uploads
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

app.mount(
    "/uploads",
    StaticFiles(directory=UPLOAD_DIR),
    name="uploads"
)


# Register API routers
app.include_router(products_router)
app.include_router(category_router)
app.include_router(auth_router)
app.include_router(orders_router)
app.include_router(store_setting_router)
app.include_router(address_router)
app.include_router(customers_router)
app.include_router(coupons_router)


@app.get("/")
def home():
    return {
        "message": "Welcome to Convenience Store API",
        "status": "Running"
    }


@app.get("/db-check")
def database_check(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))

    return {
        "message": "PostgreSQL connected successfully!",
        "database": "convenience_store",
        "status": "Connected"
    }
