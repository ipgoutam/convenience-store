
from pydantic import (
    BaseModel,
    EmailStr,
    ConfigDict,
    Field,
    model_validator
)
from typing import Optional
from datetime import datetime


# User registration
class UserCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, min_length=10, max_length=15)
    password: str = Field(..., min_length=8, max_length=128)

    @model_validator(mode="after")
    def validate_contact_method(self):
        if not self.email and not self.phone:
            raise ValueError("Please provide an email address or phone number.")
        return self

# User login
class UserLogin(BaseModel):
    identifier: str = Field(..., min_length=1, max_length=150)
    password: str = Field(..., min_length=1, max_length=128)


# User profile update
class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=150)
    phone: Optional[str] = Field(default=None, min_length=10, max_length=15)


# Change password
class PasswordChange(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=8, max_length=128)


# User API response
class UserResponse(BaseModel):
    id: int
    full_name: str
    email: Optional[EmailStr] = None
    phone: Optional[str]
    role: str
    is_active: bool
    section_permissions: dict[str, bool] = Field(default_factory=dict)
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

# JWT token response
class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"



class AdminCustomerResponse(BaseModel):
    id: int
    full_name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    role: str
    is_active: bool
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CustomerStatusUpdate(BaseModel):
    is_active: bool


# Forgot password - request OTP
class ForgotPasswordRequest(BaseModel):
    email: EmailStr


# Verify password reset OTP
class VerifyResetOTPRequest(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


# Reset password
class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
    new_password: str = Field(..., min_length=8, max_length=128)

