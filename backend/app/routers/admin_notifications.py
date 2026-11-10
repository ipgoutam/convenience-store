from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.database import get_db
from app.models.notification import Notification
from app.models.user import User
from app.routers.auth import require_section_access


router = APIRouter(
    prefix="/admin/notifications",
    tags=["Admin Notifications"]
)


# Response schema for admin
class AdminNotificationResponse(BaseModel):
    id: int
    user_id: int
    title: str
    message: str
    notification_type: str
    order_id: Optional[int] = None
    is_read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
    customer_name: str = ""
    customer_email: str = ""

def format_notification(notification, customer):
    data = AdminNotificationResponse.model_validate(notification).model_dump()

    data["customer_name"] = customer.full_name
    data["customer_email"] = customer.email

    return data

# ADMIN: Get all customer notifications
@router.get("/", response_model=list[AdminNotificationResponse])
def get_all_notifications(
    search: Optional[str] = None,
    notification_type: Optional[str] = None,
    is_read: Optional[bool] = None,
    user_id: Optional[int] = Query(None, ge=1),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_section_access("notifications"))
):

    query = (
        db.query(Notification, User)
        .join(User, Notification.user_id == User.id)
    )

    if search:
        search_term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Notification.title.ilike(search_term),
                Notification.message.ilike(search_term),
                User.full_name.ilike(search_term),
                User.email.ilike(search_term)
            )
        )

    if notification_type:
        query = query.filter(
            Notification.notification_type == notification_type
        )

    if is_read is not None:
        query = query.filter(Notification.is_read == is_read)

    if user_id is not None:
        query = query.filter(Notification.user_id == user_id)

    rows = (
        query
        .order_by(Notification.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return [
        format_notification(notification, customer)
        for notification, customer in rows
    ]


# ADMIN: Notification statistics
@router.get("/stats")
def get_notification_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_section_access("notifications"))
):

    total = db.query(func.count(Notification.id)).scalar() or 0

    unread = (
        db.query(func.count(Notification.id))
        .filter(Notification.is_read.is_(False))
        .scalar() or 0
    )

    read = total - unread

    return {
        "total_notifications": total,
        "unread_notifications": unread,
        "read_notifications": read
    }


# ADMIN: Get one notification with customer details
@router.get("/{notification_id}", response_model=AdminNotificationResponse)
def get_notification_details(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_section_access("notifications"))
):

    result = (
        db.query(Notification, User)
        .join(User, Notification.user_id == User.id)
        .filter(Notification.id == notification_id)
        .first()
    )

    if not result:
        raise HTTPException(
            status_code=404,
            detail="Notification not found"
        )

    notification, customer = result

    return format_notification(notification, customer)


# ADMIN: Mark notification as read
@router.patch("/{notification_id}/read")
def admin_mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_section_access("notifications"))
):

    notification = db.query(Notification).filter(
        Notification.id == notification_id
    ).first()

    if not notification:
        raise HTTPException(
            status_code=404,
            detail="Notification not found"
        )

    notification.is_read = True
    db.commit()

    return {"message": "Notification marked as read"}


# ADMIN: Delete notification
@router.delete("/{notification_id}")
def admin_delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_section_access("notifications"))
):

    notification = db.query(Notification).filter(
        Notification.id == notification_id
    ).first()

    if not notification:
        raise HTTPException(
            status_code=404,
            detail="Notification not found"
        )

    db.delete(notification)
    db.commit()

    return {"message": "Notification deleted successfully"}