
import os
import razorpay

from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")

if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
    raise RuntimeError("Razorpay API credentials are missing from .env")

client = razorpay.Client(
    auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)
)


def create_razorpay_order(amount, receipt):
    """
    Create a Razorpay order.
    Amount must be in INR; Razorpay expects paise.
    """
    amount_in_paise = int(round(float(amount) * 100))

    if amount_in_paise <= 0:
        raise HTTPException(
            status_code=400,
            detail="Payment amount must be greater than zero"
        )

    try:
        return client.order.create({
            "amount": amount_in_paise,
            "currency": "INR",
            "receipt": str(receipt)
        })
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="Unable to create Razorpay payment order"
        )


def verify_razorpay_signature(
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature
):
    """Verify the payment signature returned by Razorpay."""
    try:
        client.utility.verify_payment_signature({
            "razorpay_order_id": razorpay_order_id,
            "razorpay_payment_id": razorpay_payment_id,
            "razorpay_signature": razorpay_signature
        })
        return True
    except razorpay.errors.SignatureVerificationError:
        return False
