import os
import hmac
import hashlib
import json

from dotenv import load_dotenv
from fastapi import Request, Header
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from decimal import Decimal



from sqlalchemy import func
from app.database import get_db
from app.models.payment import Payment
from app.models.order import Order
from app.models.store_setting import StoreSetting
from app.models.user import User
from app.schemas.payment import (
    PaymentCreate,
    PaymentOrderResponse,
    PaymentVerify,
    PaymentResponse
)
from app.routers.auth import get_current_user, require_section_access
from app.services.razorpay_service import (
    create_razorpay_order,
    verify_razorpay_signature,
    RAZORPAY_KEY_ID,
    client
)
from app.services.notification_service import create_notification
from app.models.refund_attempt import RefundAttempt



router = APIRouter(prefix="/payments", tags=["Payments"])

def notify_all_admins(
    db: Session,
    title: str,
    message: str,
    notification_type: str,
    order_id: int
):
    admins = db.query(User).filter(
        User.role.in_(["admin", "super_admin"]),
        User.is_active == True
    ).all()

    for admin in admins:
        create_notification(
            db=db,
            user_id=admin.id,
            title=title,
            message=message,
            notification_type=notification_type,
            order_id=order_id
        )


# 1. Create Razorpay payment order
@router.post("/create-order", response_model=PaymentOrderResponse)
def create_payment_order(
    payment_data: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    order = (
        db.query(Order)
        .filter(
            Order.id == payment_data.order_id,
            Order.customer_id == current_user.id
        )
        .with_for_update()
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.payment_method != "online":
        raise HTTPException(
            status_code=400,
            detail="This order does not use online payment"
        )

    if order.payment_status != "pending":
        raise HTTPException(
            status_code=400,
            detail="This order is not awaiting payment"
        )

    if order.order_status == "cancelled":
        raise HTTPException(
            status_code=400,
            detail="Cancelled orders cannot be paid"
        )

    settings = db.query(StoreSetting).first()

    if not settings or not settings.online_payment_enabled:
        raise HTTPException(
            status_code=400,
            detail="Online payments are currently unavailable"
        )

    amount = Decimal(str(order.total_amount))

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid payment amount")

    # Reuse an existing pending payment instead of creating a duplicate
    existing_payment = (
        db.query(Payment)
        .filter(
            Payment.order_id == order.id,
            Payment.status == "pending"
        )
        .order_by(Payment.id.desc())
        .first()
    )

    if existing_payment:
        return PaymentOrderResponse(
            payment_id=existing_payment.id,
            order_id=order.id,
            razorpay_order_id=existing_payment.razorpay_order_id,
            amount=float(existing_payment.amount),
            currency=existing_payment.currency,
            razorpay_key_id=RAZORPAY_KEY_ID,
            status=existing_payment.status
        )

    razorpay_order = create_razorpay_order(
        amount,
        f"order_{order.id}"
    )

    payment = Payment(
        order_id=order.id,
        razorpay_order_id=razorpay_order["id"],
        amount=amount,
        currency="INR",
        status="pending"
    )

    try:
        db.add(payment)
        db.commit()
        db.refresh(payment)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to save payment record"
        )

    return PaymentOrderResponse(
        payment_id=payment.id,
        order_id=order.id,
        razorpay_order_id=razorpay_order["id"],
        amount=float(amount),
        currency="INR",
        razorpay_key_id=RAZORPAY_KEY_ID,
        status=payment.status
    )


# 2. Verify Razorpay payment
@router.post("/verify")
def verify_payment(
    verification: PaymentVerify,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    payment = (
        db.query(Payment)
        .join(Order, Payment.order_id == Order.id)
        .filter(
            Payment.razorpay_order_id == verification.razorpay_order_id,
            Order.customer_id == current_user.id
        )
        .with_for_update()
        .first()
    )

    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    if payment.status == "paid":
        return {"message": "Payment already verified"}

    if payment.status != "pending":
        raise HTTPException(
            status_code=400,
            detail="This payment cannot be verified"
        )

    signature_valid = verify_razorpay_signature(
        verification.razorpay_order_id,
        verification.razorpay_payment_id,
        verification.razorpay_signature
    )

    if not signature_valid:
        raise HTTPException(
            status_code=400,
            detail="Invalid payment signature"
        )

    try:
        razorpay_payment = client.payment.fetch(
            verification.razorpay_payment_id
        )
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="Unable to verify payment with Razorpay"
        )

    if razorpay_payment.get("order_id") != payment.razorpay_order_id:
        raise HTTPException(status_code=400, detail="Payment order mismatch")

    if int(razorpay_payment.get("amount", 0)) != int(
        round(float(payment.amount) * 100)
    ):
        raise HTTPException(status_code=400, detail="Payment amount mismatch")

    if razorpay_payment.get("status") != "captured":
        raise HTTPException(
            status_code=400,
            detail="Payment has not been captured yet"
        )

    order = (
        db.query(Order)
        .filter(Order.id == payment.order_id)
        .with_for_update()
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.payment_status != "pending":
        raise HTTPException(
            status_code=400,
            detail="Order payment status has already changed"
        )
    payment.razorpay_payment_id = verification.razorpay_payment_id
    payment.payment_method = razorpay_payment.get("method")
    payment.status = "paid"
    order.payment_status = "paid"

    create_notification(
        db=db,
        user_id=current_user.id,
        title="Payment successful",
        message=f"Payment for order #{order.id} was successful.",
        notification_type="payment_success",
        order_id=order.id
    )

    if order.order_status == "cancelled":
        create_notification(
            db=db,
            user_id=current_user.id,
            title="Payment received for cancelled order",
            message=f"Payment was received for cancelled order #{order.id}. A refund may be required.",
            notification_type="payment_after_cancellation",
            order_id=order.id
        )

        notify_all_admins(
            db=db,
            title="Refund action required",
            message=f"Payment received for cancelled order #{order.id}. Please review the refund.",
            notification_type="refund_required",
            order_id=order.id
        )

    else:
        create_notification(
            db=db,
            user_id=current_user.id,
            title="Payment successful",
            message=f"Payment for order #{order.id} was successful.",
            notification_type="payment_success",
            order_id=order.id
        )

        notify_all_admins(
            db=db,
            title="Payment received",
            message=f"Payment received for order #{order.id}.",
            notification_type="payment_success",
            order_id=order.id
        )

    db.commit()

    return {
        "message": "Payment verified successfully",
        "payment_id": payment.id,
        "order_id": order.id,
        "payment_status": "paid"
    }


# 3. Admin views all payment records
@router.get("/admin/all", response_model=list[PaymentResponse])
def get_all_payments(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_section_access("orders"))
):
    return (
        db.query(Payment)
        .order_by(Payment.created_at.desc())
        .all()
    )


# 4. Admin payment summary
@router.get("/admin/summary")
def get_payment_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_section_access("orders"))
):
    total_payments = db.query(func.count(Payment.id)).scalar() or 0

    paid_payments = (
        db.query(func.count(Payment.id))
        .filter(Payment.status == "paid")
        .scalar() or 0
    )

    pending_payments = (
        db.query(func.count(Payment.id))
        .filter(Payment.status == "pending")
        .scalar() or 0
    )

    failed_payments = (
        db.query(func.count(Payment.id))
        .filter(Payment.status == "failed")
        .scalar() or 0
    )

    refunded_payments = (
        db.query(func.count(Payment.id))
        .filter(Payment.status == "refunded")
        .scalar() or 0
    )

    total_collected = (
        db.query(func.coalesce(func.sum(Payment.amount), 0))
        .filter(Payment.status == "paid")
        .scalar()
    )

    return {
        "total_payments": total_payments,
        "paid_payments": paid_payments,
        "pending_payments": pending_payments,
        "failed_payments": failed_payments,
        "refunded_payments": refunded_payments,
        "total_collected": float(total_collected)
    }


# 5. View a customer's payment
@router.get("/{payment_id}", response_model=PaymentResponse)
def get_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    payment = (
        db.query(Payment)
        .join(Order, Payment.order_id == Order.id)
        .filter(
            Payment.id == payment_id,
            Order.customer_id == current_user.id
        )
        .first()
    )

    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    return payment


load_dotenv()
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET")

# 6.
@router.post("/webhook")
async def razorpay_webhook(
    request: Request,
    razorpay_signature: str = Header(
        default=None,
        alias="X-Razorpay-Signature"
    ),
    db: Session = Depends(get_db)
):
    if not RAZORPAY_WEBHOOK_SECRET or not razorpay_signature:
        raise HTTPException(
            status_code=400,
            detail="Webhook configuration or signature missing"
        )

    body = await request.body()

    expected_signature = hmac.new(
        RAZORPAY_WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(
        expected_signature,
        razorpay_signature
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid webhook signature"
        )

    try:
        payload = json.loads(body)
        event = payload.get("event")
        entity = (
            payload.get("payload", {})
            .get("payment", {})
            .get("entity", {})
        )

        razorpay_order_id = entity.get("order_id")
        razorpay_payment_id = entity.get("id")

        if not razorpay_order_id or not razorpay_payment_id:
            return {"message": "Payment details missing"}
        payment = (
            db.query(Payment)
            .filter(
                Payment.razorpay_order_id == razorpay_order_id
            )
            .with_for_update()
            .first()
        )

        if not payment:
            return {"message": "Payment record not found"}

        order = (
            db.query(Order)
            .filter(Order.id == payment.order_id)
            .with_for_update()
            .first()
        )

        if not order:
            return {"message": "Order record not found"}

        if event == "payment.captured":
            if payment.status in ("pending", "failed"):
                if (
                    entity.get("amount")
                    != int(round(float(payment.amount) * 100))
                ):
                    raise HTTPException(
                        status_code=400,
                        detail="Payment amount mismatch"
                    )

                if order.payment_status != "pending":
                    raise HTTPException(
                        status_code=409,
                        detail="Order payment status has changed"
                    )

                # Record the captured payment
                payment.status = "paid"
                payment.razorpay_payment_id = razorpay_payment_id
                payment.payment_method = entity.get("method")
                order.payment_status = "paid"

                if order.order_status == "cancelled":
                    # Payment arrived after the order was cancelled.
                    # Admin must review and arrange a refund.
                    create_notification(
                        db=db,
                        user_id=order.customer_id,
                        title="Payment received for cancelled order",
                        message=(
                            f"Payment was received for cancelled order #{order.id}. "
                            "Please contact the store regarding your refund."
                        ),
                        notification_type="payment_after_cancellation",
                        order_id=order.id
                    )

                    notify_all_admins(
                        db=db,
                        title="Refund action required",
                        message=(
                            f"Payment was captured for cancelled order #{order.id}. "
                            "Please review and arrange a refund."
                        ),
                        notification_type="refund_required",
                        order_id=order.id
                    )

                else:
                    create_notification(
                        db=db,
                        user_id=order.customer_id,
                        title="Payment successful",
                        message=f"Payment for order #{order.id} was successful.",
                        notification_type="payment_success",
                        order_id=order.id
                    )

                    notify_all_admins(
                        db=db,
                        title="Payment received",
                        message=f"Payment received for order #{order.id}.",
                        notification_type="payment_success",
                        order_id=order.id
                    )

        elif event == "payment.failed":
            if payment.status == "pending":
                payment.status = "failed"
                payment.razorpay_payment_id = razorpay_payment_id
                payment.failure_reason = (
                    entity.get("error_description") or "Payment failed"
                )

                create_notification(
                    db=db,
                    user_id=order.customer_id,
                    title="Payment failed",
                    message=f"Payment for order #{order.id} failed. Please try again.",
                    notification_type="payment_failed",
                    order_id=order.id
                )

                notify_all_admins(
                    db=db,
                    title="Payment failed",
                    message=f"Payment failed for order #{order.id}.",
                    notification_type="payment_failed",
                    order_id=order.id
                )


        db.commit()

        return {"message": "Webhook processed"}

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Webhook processing failed"
        )




# 7. Admin initiates a full refund
@router.post("/{payment_id}/refund")
def refund_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_section_access("orders"))
):
    payment = (
        db.query(Payment)
        .filter(Payment.id == payment_id)
        .with_for_update()
        .first()
    )

    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    if payment.status != "paid":
        raise HTTPException(
            status_code=400,
            detail="Only successfully paid payments can be refunded"
        )

    if not payment.razorpay_payment_id:
        raise HTTPException(
            status_code=400,
            detail="Razorpay payment ID is missing"
        )

    order = (
        db.query(Order)
        .filter(Order.id == payment.order_id)
        .with_for_update()
        .first()
    )

    if not order or order.payment_status != "paid":
        raise HTTPException(
            status_code=400,
            detail="Order is not eligible for a refund"
        )

    amount = round(float(payment.amount), 2)

    # Create a separate record for this refund attempt.
    attempt = RefundAttempt(
        payment_id=payment.id,
        amount=amount,
        status="pending"
    )

    payment.razorpay_refund_id = None
    payment.status = "refund_pending"

    db.add(attempt)

    try:
        db.commit()
        db.refresh(attempt)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=502,
            detail=(
                "Refund status could not be confirmed. "
                "Check Razorpay Dashboard before retrying. "
                "Do not submit another refund until the current attempt is reconciled."
            )
        )

    try:
        refund = client.payment.refund(
            payment.razorpay_payment_id,
            {
                "amount": int(round(amount * 100)),
                "notes": {
                    "refund_attempt_id": str(attempt.id)
                }
            }
        )

        # Reload and lock records because a webhook may have arrived already.
        attempt = (
            db.query(RefundAttempt)
            .filter(RefundAttempt.id == attempt.id)
            .with_for_update()
            .first()
        )

        payment = (
            db.query(Payment)
            .filter(Payment.id == payment.id)
            .with_for_update()
            .first()
        )

        refund_id = refund.get("id")

        if not refund_id:
            raise RuntimeError("Razorpay did not return a refund ID")

        if attempt.razorpay_refund_id and attempt.razorpay_refund_id != refund_id:
            raise RuntimeError("Refund ID mismatch")

        attempt.razorpay_refund_id = refund_id

        # Update the payment's current refund ID only for the latest attempt.
        latest_attempt_id = (
            db.query(RefundAttempt.id)
            .filter(RefundAttempt.payment_id == payment.id)
            .order_by(RefundAttempt.id.desc())
            .first()
        )

        if latest_attempt_id and latest_attempt_id[0] == attempt.id:
            payment.razorpay_refund_id = refund_id

        if attempt.status == "pending":
            create_notification(
                db=db,
                user_id=order.customer_id,
                title="Refund requested",
                message=f"A refund has been requested for order #{order.id}.",
                notification_type="refund_requested",
                order_id=order.id
            )

            notify_all_admins(
                db=db,
                title="Refund requested",
                message=f"A refund has been requested for order #{order.id}.",
                notification_type="refund_requested",
                order_id=order.id
            )

        db.commit()

        return {
            "message": "Refund request submitted",
            "payment_id": payment.id,
            "refund_attempt_id": attempt.id,
            "razorpay_refund_id": attempt.razorpay_refund_id,
            "refund_status": refund.get("status"),
            "payment_status": payment.status
        }

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=502,
            detail=(
                "Refund request could not be confirmed. "
                "Check Razorpay Dashboard before retrying."
            )
        )



# 8. Admin records Cash on Delivery collection
@router.patch("/cash-on-delivery/{order_id}/collect")
def collect_cash_on_delivery(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_section_access("orders"))
):
    order = (
        db.query(Order)
        .filter(Order.id == order_id)
        .with_for_update()
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.payment_method != "cash":
        raise HTTPException(
            status_code=400,
            detail="This is not a Cash on Delivery order"
        )

    if order.order_status == "cancelled":
        raise HTTPException(
            status_code=400,
            detail="Cancelled orders cannot be collected"
        )

    if order.payment_status != "pending":
        raise HTTPException(
            status_code=400,
            detail="This order is not awaiting cash collection"
        )

    order.payment_status = "paid"

    create_notification(
        db=db,
        user_id=order.customer_id,
        title="Cash payment received",
        message=f"Cash payment for order #{order.id} has been collected.",
        notification_type="cash_collected",
        order_id=order.id
    )

    notify_all_admins(
        db=db,
        title="Cash payment collected",
        message=f"Cash payment collected for order #{order.id}.",
        notification_type="cash_collected",
        order_id=order.id
    )

    db.commit()

    return {
        "message": "Cash collected successfully",
        "order_id": order.id,
        "payment_status": order.payment_status
    }



# 9. Razorpay refund webhook
@router.post("/refund-webhook")
async def razorpay_refund_webhook(
    request: Request,
    razorpay_signature: str = Header(
        default=None,
        alias="X-Razorpay-Signature"
    ),
    db: Session = Depends(get_db)
):
    if not RAZORPAY_WEBHOOK_SECRET or not razorpay_signature:
        raise HTTPException(
            status_code=400,
            detail="Webhook configuration or signature missing"
        )

    body = await request.body()

    expected_signature = hmac.new(
        RAZORPAY_WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        payload = json.loads(body)
        event = payload.get("event")

        refund = (
            payload.get("payload", {})
            .get("refund", {})
            .get("entity", {})
        )

        if event not in ["refund.processed", "refund.failed"]:
            return {"message": "Event ignored"}

        razorpay_payment_id = refund.get("payment_id")
        razorpay_refund_id = refund.get("id")
        notes = refund.get("notes") or {}
        attempt_id = notes.get("refund_attempt_id")

        if not razorpay_payment_id or not razorpay_refund_id or not attempt_id:
            raise HTTPException(
                status_code=400,
                detail="Refund details or attempt ID missing"
            )

        payment = (
            db.query(Payment)
            .filter(Payment.razorpay_payment_id == razorpay_payment_id)
            .with_for_update()
            .first()
        )

        if not payment:
            return {"message": "Payment record not found"}

        attempt = (
            db.query(RefundAttempt)
            .filter(
                RefundAttempt.id == int(attempt_id),
                RefundAttempt.payment_id == payment.id
            )
            .with_for_update()
            .first()
        )

        if not attempt:
            raise HTTPException(
                status_code=404,
                detail="Refund attempt not found"
            )

        if attempt.razorpay_refund_id and attempt.razorpay_refund_id != razorpay_refund_id:
            raise HTTPException(status_code=400, detail="Refund ID mismatch")

        expected_amount = int(round(float(attempt.amount) * 100))

        if refund.get("amount") != expected_amount:
            raise HTTPException(status_code=400, detail="Refund amount mismatch")

        order = (
            db.query(Order)
            .filter(Order.id == payment.order_id)
            .with_for_update()
            .first()
        )

        if not order:
            return {"message": "Order record not found"}

        # Ignore duplicate events for an already completed attempt.
        if attempt.status in ["processed", "failed"]:
            return {"message": "Refund attempt already processed"}

        attempt.razorpay_refund_id = razorpay_refund_id

        if event == "refund.processed":
            attempt.status = "processed"
            payment.razorpay_refund_id = razorpay_refund_id
            payment.status = "refunded"
            order.payment_status = "refunded"

            create_notification(
                db=db,
                user_id=order.customer_id,
                title="Refund completed",
                message=f"Your refund for order #{order.id} has been processed successfully.",
                notification_type="refund_completed",
                order_id=order.id
            )

            notify_all_admins(
                db=db,
                title="Refund completed",
                message=f"Refund completed for order #{order.id}.",
                notification_type="refund_completed",
                order_id=order.id
            )

        elif event == "refund.failed":
            attempt.status = "failed"
            attempt.failure_reason = (
                refund.get("error_description") or "Refund failed"
            )

            latest_attempt = (
                db.query(RefundAttempt)
                .filter(RefundAttempt.payment_id == payment.id)
                .order_by(RefundAttempt.id.desc())
                .first()
            )

            # Only the latest failed attempt may restore payment status.
            if latest_attempt and latest_attempt.id == attempt.id:
                if payment.status == "refund_pending":
                    payment.status = "paid"
                    payment.razorpay_refund_id = razorpay_refund_id

            create_notification(
                db=db,
                user_id=order.customer_id,
                title="Refund failed",
                message=f"Your refund for order #{order.id} could not be processed. Please contact the store.",
                notification_type="refund_failed",
                order_id=order.id
            )

            notify_all_admins(
                db=db,
                title="Refund failed",
                message=f"Refund failed for order #{order.id}. Please review it.",
                notification_type="refund_failed",
                order_id=order.id
            )

        db.commit()

        return {"message": "Refund webhook processed"}

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Refund webhook processing failed"
        )
