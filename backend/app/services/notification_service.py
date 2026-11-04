
import os
import re
import smtplib
import logging

from email.message import EmailMessage
from email.utils import formataddr
from dotenv import load_dotenv
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.models.notification import Notification
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
EMAIL_FROM_NAME = os.getenv("EMAIL_FROM_NAME", "Convenience Store")


# --------------------------------------------------
# SMS CONFIGURATION
# --------------------------------------------------

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")


# --------------------------------------------------
# EMAIL SENDER
# --------------------------------------------------

def send_email(recipient: str, title: str, message: str):
    if not SMTP_EMAIL or not SMTP_APP_PASSWORD:
        logger.warning("Email credentials are not configured.")
        return

    try:
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

        logger.info("Email notification sent to %s", recipient)

    except Exception:
        logger.exception("Unable to send email to %s", recipient)


# --------------------------------------------------
# PHONE NUMBER FORMATTER
# --------------------------------------------------

def format_phone_number(phone: str):
    if not phone:
        return None

    phone = re.sub(r"[\s\-()]", "", phone)

    # Convert a 10-digit Indian mobile number to E.164.
    if re.fullmatch(r"\d{10}", phone):
        return f"+91{phone}"

    # Convert an Indian number beginning with 91.
    if re.fullmatch(r"91\d{10}", phone):
        return f"+{phone}"

    # Already in international format.
    if re.fullmatch(r"\+\d{8,15}", phone):
        return phone

    logger.warning("Invalid phone number format.")
    return None


# --------------------------------------------------
# SMS SENDER
# --------------------------------------------------

def send_sms(recipient: str, message: str):
    if not all([
        TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN,
        TWILIO_PHONE_NUMBER
    ]):
        logger.warning("Twilio SMS credentials are not configured.")
        return

    formatted_phone = format_phone_number(recipient)

    if not formatted_phone:
        logger.warning("SMS skipped because phone number is invalid.")
        return

    try:
        from twilio.rest import Client

        client = Client(
            TWILIO_ACCOUNT_SID,
            TWILIO_AUTH_TOKEN
        )

        client.messages.create(
            body=message,
            from_=TWILIO_PHONE_NUMBER,
            to=formatted_phone
        )

        logger.info("SMS notification sent to %s", formatted_phone)

    except Exception:
        logger.exception("Unable to send SMS.")


# --------------------------------------------------
# SEND BOTH EMAIL AND SMS
# --------------------------------------------------

def send_notification_channels(notification_data: dict):
    email = notification_data.get("email")
    phone = notification_data.get("phone")

    title = notification_data["title"]
    message = notification_data["message"]

    if email:
        send_email(
            recipient=email,
            title=title,
            message=message
        )

    if phone:
        send_sms(
            recipient=phone,
            message=f"{title}\n{message}"
        )


# --------------------------------------------------
# SEND QUEUED MESSAGES AFTER DATABASE COMMIT
# --------------------------------------------------

def send_queued_notifications(session: Session):
    notifications = session.info.pop(
        "outbound_notifications",
        []
    )

    for notification_data in notifications:
        try:
            send_notification_channels(notification_data)
        except Exception:
            logger.exception("Notification delivery failed.")


def clear_queued_notifications(session: Session):
    session.info.pop("outbound_notifications", None)


# Register database transaction events.
event.listen(
    Session,
    "after_commit",
    send_queued_notifications
)

event.listen(
    Session,
    "after_rollback",
    clear_queued_notifications
)


# --------------------------------------------------
# CREATE IN-APP NOTIFICATION
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

    # Get customer email and phone.
    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    # Queue external messages.
    # They are sent only after the transaction commits.
    if user and (user.email or user.phone):
        db.info.setdefault(
            "outbound_notifications",
            []
        ).append({
            "email": user.email,
            "phone": user.phone,
            "title": title,
            "message": message
        })

    return notification
