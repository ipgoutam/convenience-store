
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.notification_delivery import NotificationDelivery
from app.models.notification import Notification
from app.models.user import User
from app.routers.auth import get_current_user


router = APIRouter(
    prefix="/admin/notification-deliveries",
    tags=["Admin Notification Deliveries"]
)


def check_admin(current_user: User):
    role = getattr(current_user.role, "value", current_user.role)

    if str(role).lower() not in ["admin", "super_admin"]:
        raise HTTPException(
            status_code=403,
            detail="Admin access required"
        )


# ADMIN: Get all delivery records
@router.get("/")
def get_all_deliveries(
    channel: Optional[str] = None,
    status: Optional[str] = None,
    user_id: Optional[int] = Query(None, ge=1),
    notification_id: Optional[int] = Query(None, ge=1),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    check_admin(current_user)

    query = (
        db.query(NotificationDelivery, User, Notification)
        .join(User, NotificationDelivery.user_id == User.id)
        .join(
            Notification,
            NotificationDelivery.notification_id == Notification.id
        )
    )

    if channel:
        query = query.filter(
            NotificationDelivery.channel == channel.lower()
        )

    if status:
        query = query.filter(
            NotificationDelivery.status == status.lower()
        )

    if user_id:
        query = query.filter(
            NotificationDelivery.user_id == user_id
        )

    if notification_id:
        query = query.filter(
            NotificationDelivery.notification_id == notification_id
        )

    rows = (
        query
        .order_by(NotificationDelivery.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return [
        {
            "id": delivery.id,
            "notification_id": delivery.notification_id,
            "user_id": delivery.user_id,
            "customer_name": customer.full_name,
            "customer_email": customer.email,
            "notification_title": notification.title,
            "channel": delivery.channel,
            "recipient": delivery.recipient,
            "status": delivery.status,
            "attempts": delivery.attempts,
            "error_message": delivery.error_message,
            "sent_at": delivery.sent_at,
            "created_at": delivery.created_at,
            "updated_at": delivery.updated_at
        }
        for delivery, customer, notification in rows
    ]


# ADMIN: Delivery statistics
@router.get("/stats")
def get_delivery_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    check_admin(current_user)

    total = db.query(func.count(NotificationDelivery.id)).scalar() or 0

    sent = (
        db.query(func.count(NotificationDelivery.id))
        .filter(NotificationDelivery.status == "sent")
        .scalar() or 0
    )

    failed = (
        db.query(func.count(NotificationDelivery.id))
        .filter(NotificationDelivery.status == "failed")
        .scalar() or 0
    )

    pending = (
        db.query(func.count(NotificationDelivery.id))
        .filter(NotificationDelivery.status == "pending")
        .scalar() or 0
    )

    return {
        "total_deliveries": total,
        "sent": sent,
        "failed": failed,
        "pending": pending
    }


# ADMIN: Get delivery details
@router.get("/{delivery_id}")
def get_delivery_details(
    delivery_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    check_admin(current_user)

    result = (
        db.query(NotificationDelivery, User, Notification)
        .join(User, NotificationDelivery.user_id == User.id)
        .join(
            Notification,
            NotificationDelivery.notification_id == Notification.id
        )
        .filter(NotificationDelivery.id == delivery_id)
        .first()
    )

    if not result:
        raise HTTPException(
            status_code=404,
            detail="Delivery record not found"
        )

    delivery, customer, notification = result

    return {
        "id": delivery.id,
        "notification_id": delivery.notification_id,
        "user_id": delivery.user_id,
        "customer_name": customer.full_name,
        "customer_email": customer.email,
        "notification_title": notification.title,
        "notification_message": notification.message,
        "channel": delivery.channel,
        "recipient": delivery.recipient,
        "status": delivery.status,
        "attempts": delivery.attempts,
        "error_message": delivery.error_message,
        "sent_at": delivery.sent_at,
        "created_at": delivery.created_at,
        "updated_at": delivery.updated_at
    }
