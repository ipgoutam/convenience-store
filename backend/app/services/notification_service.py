
import os
import re
import logging
import smtplib
import httpx

from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import formataddr

from dotenv import load_dotenv
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.notification import Notification
from app.models.notification_delivery import NotificationDelivery
from app.models.notification_preference import NotificationPreference
from app.models.user import User


load_dotenv()

logger = logging.getLogger(__name__)


# --------------------------------------------------
# EMAIL CONFIGURATION
# --------------------------------------------------

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))

SMTP_EMAIL = os.getenv("SMTP_EMAIL")
SMTP_APP_PASSWORD = os.getenv("SMTP_APP_PASSWORD")
EMAIL_FROM_NAME = os.getenv("EMAIL_FROM_NAME", "G-MART")


# --------------------------------------------------
# MSG91 CONFIGURATION
# --------------------------------------------------

MSG91_AUTH_KEY = os.getenv("MSG91_AUTH_KEY")
MSG91_TEMPLATE_ID = os.getenv("MSG91_TEMPLATE_ID")

MSG91_API_URL = "https://control.msg91.com/api/v5/flow"


# --------------------------------------------------
# PHONE NUMBER FORMATTER
# --------------------------------------------------

def format_phone_number(phone: str):
    if not phone:
        return None

    phone = re.sub(r"[\s\-()]", "", phone)

    # Indian number with +91
    if re.fullmatch(r"\+91\d{10}", phone):
        return phone[1:]

    # Indian number with 91
    if re.fullmatch(r"91\d{10}", phone):
        return phone

    # Indian 10-digit number
    if re.fullmatch(r"\d{10}", phone):
        return f"91{phone}"

    # Other international numbers
    if re.fullmatch(r"\+\d{8,15}", phone):
        return phone[1:]

    logger.warning("Invalid phone number format.")
    return None


# --------------------------------------------------
# EMAIL SENDER
# --------------------------------------------------

def send_email(recipient: str, title: str, message: str):

    if not SMTP_EMAIL or not SMTP_APP_PASSWORD:
        raise RuntimeError("Gmail SMTP credentials are not configured.")

    email = EmailMessage()

    email["Subject"] = title
    email["From"] = formataddr((EMAIL_FROM_NAME, SMTP_EMAIL))
    email["To"] = recipient

    email.set_content(
        f"""Hello,

{message}

Thank you,
{EMAIL_FROM_NAME}
"""
    )

    with smtplib.SMTP_SSL(
        SMTP_HOST,
        SMTP_PORT,
        timeout=15
    ) as server:

        server.login(SMTP_EMAIL, SMTP_APP_PASSWORD)
        server.send_message(email)

    logger.info("Email notification sent successfully.")


# --------------------------------------------------
# MSG91 SMS SENDER
# --------------------------------------------------

def send_sms(recipient: str, title: str, message: str):

    if not MSG91_AUTH_KEY or not MSG91_TEMPLATE_ID:
        raise RuntimeError("MSG91 credentials or template ID are missing.")

    formatted_phone = format_phone_number(recipient)

    if not formatted_phone:
        raise ValueError("Invalid phone number.")

    payload = {
        "template_id": MSG91_TEMPLATE_ID,
        "recipients": [
            {
                "mobiles": formatted_phone,
                "VAR1": title,
                "VAR2": message
            }
        ]
    }

    headers = {
        "accept": "application/json",
        "authkey": MSG91_AUTH_KEY,
        "content-type": "application/json"
    }

    response = httpx.post(
        MSG91_API_URL,
        json=payload,
        headers=headers,
        timeout=15
    )

    response.raise_for_status()

    result = response.json()

    if (
        str(result.get("type", "")).lower() == "error"
        or str(result.get("msg_type", "")).lower() == "error"
    ):
        raise RuntimeError(
            f"MSG91 rejected the SMS request: {result.get('message', 'Unknown error')}"
        )

    logger.info("SMS request accepted by MSG91.")


# --------------------------------------------------
# SEND ONE DELIVERY
# --------------------------------------------------

def send_delivery(delivery: NotificationDelivery):

    notification = (
        db_query_notification(delivery.notification_id)
    )

    if not notification:
        raise RuntimeError("Related notification was not found.")

    if delivery.channel == "email":

        send_email(
            recipient=delivery.recipient,
            title=notification.title,
            message=notification.message
        )

    elif delivery.channel == "sms":

        send_sms(
            recipient=delivery.recipient,
            title=notification.title,
            message=notification.message
        )

    else:
        raise ValueError("Unsupported notification channel.")


def db_query_notification(notification_id: int):

    with SessionLocal() as db:
        return db.query(Notification).filter(
            Notification.id == notification_id
        ).first()


# --------------------------------------------------
# PROCESS QUEUED DELIVERIES AFTER COMMIT
# --------------------------------------------------

def send_queued_notifications(session: Session):

    delivery_ids = session.info.pop(
        "outbound_delivery_ids",
        []
    )

    if not delivery_ids:
        return

    for delivery_id in delivery_ids:

        try:
            with SessionLocal() as db:

                delivery = db.query(NotificationDelivery).filter(
                    NotificationDelivery.id == delivery_id
                ).first()

                if not delivery or delivery.status != "pending":
                    continue

                # Record the attempt before sending.
                delivery.attempts += 1
                db.commit()

                try:
                    notification = db.query(Notification).filter(
                        Notification.id == delivery.notification_id
                    ).first()

                    if not notification:
                        raise RuntimeError(
                            "Related notification was not found."
                        )

                    if delivery.channel == "email":

                        send_email(
                            recipient=delivery.recipient,
                            title=notification.title,
                            message=notification.message
                        )

                    elif delivery.channel == "sms":

                        send_sms(
                            recipient=delivery.recipient,
                            title=notification.title,
                            message=notification.message
                        )

                    else:
                        raise ValueError(
                            "Unsupported notification channel."
                        )

                    delivery.status = "sent"
                    delivery.sent_at = datetime.now(timezone.utc)
                    delivery.error_message = None

                except Exception as exc:

                    delivery.status = "failed"
                    delivery.error_message = str(exc)[:2000]

                    logger.exception(
                        "Notification delivery %s failed.",
                        delivery_id
                    )

                db.commit()

        except Exception:

            logger.exception(
                "Unable to process notification delivery %s.",
                delivery_id
            )


def clear_queued_notifications(session: Session):

    session.info.pop("outbound_delivery_ids", None)


# --------------------------------------------------
# DATABASE TRANSACTION EVENTS
# --------------------------------------------------

if not event.contains(
    Session,
    "after_commit",
    send_queued_notifications
):
    event.listen(
        Session,
        "after_commit",
        send_queued_notifications
    )

if not event.contains(
    Session,
    "after_rollback",
    clear_queued_notifications
):
    event.listen(
        Session,
        "after_rollback",
        clear_queued_notifications
    )


# --------------------------------------------------
# CREATE IN-APP NOTIFICATION
# AND QUEUE EMAIL / SMS
# --------------------------------------------------

def create_notification(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    notification_type: str,
    order_id: int = None
):

    notification = Notification(
        user_id=user_id,
        title=title,
        message=message,
        notification_type=notification_type,
        order_id=order_id
    )

    db.add(notification)

    # Generate notification ID inside the transaction.
    db.flush()

    user = db.query(User).filter(
        User.id == user_id
    ).first()

    if not user:
        return notification

    preferences = db.query(NotificationPreference).filter(
        NotificationPreference.user_id == user_id
    ).first()

    # Existing users without a preference record use
    # the selected defaults: email ON and SMS ON.
    email_enabled = (
        preferences.email_enabled if preferences else True
    )
    
    # SMS is temporarily disabled.
    # Keep send_sms() available for future activation.
    sms_enabled = False

    delivery_ids = []

    # Queue email delivery.
    if email_enabled and user.email:

        email_delivery = NotificationDelivery(
            notification_id=notification.id,
            user_id=user_id,
            channel="email",
            recipient=user.email,
            status="pending",
            attempts=0
        )

        db.add(email_delivery)
        db.flush()

        delivery_ids.append(email_delivery.id)

    # Queue SMS delivery.
    if sms_enabled and user.phone:

        sms_delivery = NotificationDelivery(
            notification_id=notification.id,
            user_id=user_id,
            channel="sms",
            recipient=user.phone,
            status="pending",
            attempts=0
        )

        db.add(sms_delivery)
        db.flush()

        delivery_ids.append(sms_delivery.id)

    # Send only after the transaction commits.
    if delivery_ids:

        db.info.setdefault(
            "outbound_delivery_ids",
            []
        ).extend(delivery_ids)

    return notification
