
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import (
    NotificationResponse,
    NotificationCount
)
from app.routers.auth import get_current_user


router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"]
)


# CUSTOMER: Get notifications
@router.get("/", response_model=list[NotificationResponse])
def get_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100)
):
    return (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


# CUSTOMER: Get notification counts
@router.get("/count", response_model=NotificationCount)
def get_notification_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    total = (
        db.query(func.count(Notification.id))
        .filter(Notification.user_id == current_user.id)
        .scalar() or 0
    )

    unread = (
        db.query(func.count(Notification.id))
        .filter(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False)
        )
        .scalar() or 0
    )

    return {
        "total_notifications": total,
        "unread_notifications": unread
    }


# CUSTOMER: Mark one notification as read
@router.patch("/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    ).first()

    if not notification:
        raise HTTPException(
            status_code=404,
            detail="Notification not found"
        )

    try:
        notification.is_read = True
        db.commit()

        return {
            "message": "Notification marked as read"
        }

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not update notification"
        )


# CUSTOMER: Mark all notifications as read
@router.patch("/read-all")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        updated_count = (
            db.query(Notification)
            .filter(
                Notification.user_id == current_user.id,
                Notification.is_read.is_(False)
            )
            .update(
                {"is_read": True},
                synchronize_session=False
            )
        )

        db.commit()

        return {
            "message": "All notifications marked as read",
            "updated_count": updated_count
        }

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not update notifications"
        )


# CUSTOMER: Delete one notification
@router.delete("/{notification_id}")
def delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    ).first()

    if not notification:
        raise HTTPException(
            status_code=404,
            detail="Notification not found"
        )

    try:
        db.delete(notification)
        db.commit()

        return {
            "message": "Notification deleted successfully"
        }

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not delete notification"
        )


# CUSTOMER: Delete all notifications
@router.delete("/")
def delete_all_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        deleted_count = (
            db.query(Notification)
            .filter(Notification.user_id == current_user.id)
            .delete(synchronize_session=False)
        )

        db.commit()

        return {
            "message": "All notifications deleted",
            "deleted_count": deleted_count
        }

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not delete notifications"
        )
