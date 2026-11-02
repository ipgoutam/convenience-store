from app.models.category import Category
from app.routers.category import router as category_router
import os
from fastapi.staticfiles import StaticFiles

from app.routers.products import router as products_router

from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import Base, engine, get_db
from app.models.product import Product

from app.models.user import User
from app.models.refresh_token import RefreshToken

from app.routers.auth import router as auth_router

# Create database tables
Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="Convenience Store API",
    description="Backend for our convenience store",
    version="1.0.0"
    
)
UPLOAD_DIR = "uploads"

os.makedirs(UPLOAD_DIR, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Register product routes
app.include_router(products_router)
app.include_router(category_router)
app.include_router(auth_router)


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