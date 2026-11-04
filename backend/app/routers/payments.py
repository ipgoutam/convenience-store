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
from app.routers.auth import get_current_user
from app.routers.auth import require_admin
from app.services.razorpay_service import (
    create_razorpay_order,
    verify_razorpay_signature,
    RAZORPAY_KEY_ID,
    client
)

router = APIRouter(prefix="/payments", tags=["Payments"])


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

    payment.razorpay_payment_id = verification.razorpay_payment_id
    payment.payment_method = razorpay_payment.get("method")
    payment.status = "paid"

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

    order.payment_status = "paid"

    db.commit()

    return {
        "message": "Payment verified successfully",
        "payment_id": payment.id,
        "order_id": order.id,
        "payment_status": "paid"
    }


# 3. View a customer's payment
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

        if not razorpay_order_id:
            return {"message": "Event ignored"}

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
            if payment.status != "paid":
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

                payment.status = "paid"
                payment.razorpay_payment_id = razorpay_payment_id
                payment.payment_method = entity.get("method")
                order.payment_status = "paid"

        elif event == "payment.failed":
            if payment.status == "pending":
                payment.status = "failed"
                payment.razorpay_payment_id = razorpay_payment_id
                payment.failure_reason = (
                    entity.get("error_description") or "Payment failed"
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



# 4. Admin initiates a full refund
@router.post("/{payment_id}/refund")
def refund_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
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

    try:
        refund = client.payment.refund(
            payment.razorpay_payment_id,
            {
                "amount": int(round(float(payment.amount) * 100))
            }
        )

        # Save Razorpay refund ID and wait for webhook confirmation.
        payment.razorpay_refund_id = refund.get("id")
        payment.status = "refund_pending"

        db.commit()

        return {
            "message": "Refund request submitted",
            "payment_id": payment.id,
            "razorpay_refund_id": payment.razorpay_refund_id,
            "refund_status": refund.get("status"),
            "payment_status": payment.status
        }

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=502,
            detail="Unable to process refund with Razorpay"
        )




# 6. Admin records Cash on Delivery collection
@router.patch("/cash-on-delivery/{order_id}/collect")
def collect_cash_on_delivery(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
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
    db.commit()

    return {
        "message": "Cash collected successfully",
        "order_id": order.id,
        "payment_status": order.payment_status
    }


# 7. Admin views all payment records
@router.get("/admin/all", response_model=list[PaymentResponse])
def get_all_payments(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return (
        db.query(Payment)
        .order_by(Payment.created_at.desc())
        .all()
    )


# 8. Admin payment summary
@router.get("/admin/summary")
def get_payment_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
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
