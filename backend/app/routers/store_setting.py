
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.store_setting import StoreSetting
from app.models.user import User
from app.schemas.store_setting import (
    StoreSettingCreate,
    StoreSettingUpdate,
    StoreSettingResponse
)
from app.routers.auth import get_current_user, require_section_access


router = APIRouter(
    prefix="/store",
    tags=["Store Settings"]
)


# PUBLIC: Get store settings
@router.get("/settings", response_model=StoreSettingResponse)
def get_store_settings(db: Session = Depends(get_db)):
    settings = db.query(StoreSetting).first()

    if not settings:
        raise HTTPException(
            status_code=404,
            detail="Store settings not configured"
        )

    return settings


# ADMIN: Create store settings
@router.post("/settings", response_model=StoreSettingResponse)
def create_store_settings(
    settings_data: StoreSettingCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("settings"))
):
    existing_settings = db.query(StoreSetting).first()

    if existing_settings:
        raise HTTPException(
            status_code=400,
            detail="Store settings already exist. Use update instead."
        )

    settings = StoreSetting(**settings_data.model_dump())

    try:
        db.add(settings)
        db.commit()
        db.refresh(settings)
        return settings

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not create store settings"
        )


# ADMIN: Update store settings
@router.put("/settings", response_model=StoreSettingResponse)
def update_store_settings(
    settings_data: StoreSettingUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("settings"))
):
    settings = db.query(StoreSetting).first()

    if not settings:
        raise HTTPException(
            status_code=404,
            detail="Store settings not configured"
        )

    update_data = settings_data.model_dump(exclude_unset=True)

    # Validate updated store hours
    new_opening_time = update_data.get(
        "opening_time", settings.opening_time
    )

    new_closing_time = update_data.get(
        "closing_time", settings.closing_time
    )

    if (
        ("opening_time" in update_data and new_opening_time is None)
        or ("closing_time" in update_data and new_closing_time is None)
    ):
        raise HTTPException(
            status_code=400,
            detail="Opening time and closing time cannot be null"
        )

    if new_closing_time <= new_opening_time:
        raise HTTPException(
            status_code=400,
            detail="Closing time must be later than opening time"
        )


    for field, value in update_data.items():
        setattr(settings, field, value)

    try:
        db.commit()
        db.refresh(settings)
        return settings

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not update store settings"
        )
