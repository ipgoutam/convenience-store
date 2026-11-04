
from pydantic import BaseModel, EmailStr, Field
from typing import Optional


class AdminInviteCreate(BaseModel):
    email: EmailStr


class AdminInviteAccept(BaseModel):
    token: str = Field(min_length=20)
    full_name: str = Field(min_length=2, max_length=150)
    password: str = Field(min_length=8, max_length=128)
    phone: Optional[str] = Field(default=None, min_length=10, max_length=15)


class AdminInviteResponse(BaseModel):
    email: EmailStr
    invitation_token: str
    expires_in_hours: int


class AdminAccountResponse(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    phone: Optional[str] = None
    role: str
    is_active: bool
