
from pydantic import BaseModel, Field
from typing import Optional


class PaymentCreate(BaseModel):
    order_id: int = Field(gt=0)


class PaymentOrderResponse(BaseModel):
    payment_id: int
    order_id: int
    razorpay_order_id: str
    amount: float
    currency: str
    razorpay_key_id: str
    status: str


class PaymentVerify(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class PaymentResponse(BaseModel):
    id: int
    order_id: int
    razorpay_refund_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    amount: float
    currency: str
    status: str
    payment_method: Optional[str] = None
    failure_reason: Optional[str] = None
    