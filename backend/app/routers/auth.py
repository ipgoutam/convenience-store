import hmac
import os

from app.models.password_reset_otp import PasswordResetOTP
from app.services.notification_service import send_email

from app.schemas.user import (
    ForgotPasswordRequest,
    VerifyResetOTPRequest,
    ResetPasswordRequest
)

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timedelta, timezone
import secrets
import hashlib

from app.database import get_db
from app.models.user import User
from app.models.refresh_token import RefreshToken
from app.schemas.user import (
    UserCreate,
    UserLogin,
    UserUpdate,
    PasswordChange,
    UserResponse,
    TokenResponse
)
from app.auth.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token
)
from app.models.notification_preference import NotificationPreference

router = APIRouter(prefix="/auth", tags=["Authentication"])

bearer_scheme = HTTPBearer()

REFRESH_TOKEN_EXPIRE_DAYS = 7


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_refresh_token(db: Session, user_id: int):
    token = secrets.token_urlsafe(48)

    refresh_record = RefreshToken(
        user_id=user_id,
        token_hash=hash_refresh_token(token),
        expires_at=datetime.now(timezone.utc)
        + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    )

    db.add(refresh_record)
    db.commit()

    return token


def generate_tokens(db: Session, user: User):
    access_token = create_access_token({
        "sub": str(user.id),
        "role": user.role
    })

    refresh_token = create_refresh_token(db, user.id)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db)
):
    payload = decode_access_token(credentials.credentials)

    if payload is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired access token"
        )

    user_id = payload.get("sub")

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Invalid access token"
        )

    try:
        user_id = int(user_id)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=401,
            detail="Invalid access token"
        )

    user = db.query(User).filter(User.id == user_id).first()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=401,
            detail="User not found or inactive"
        )

    return user


# Admin and super admin can use normal admin features.
def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(
            status_code=403,
            detail="Admin access required"
        )

    return current_user

# Check access to a specific admin section.
def require_section_access(section: str):

    def check_permission(
        current_user: User = Depends(get_current_user)
    ):
        # Super Admin always has full access.
        if current_user.role == "super_admin":
            return current_user

        # Only normal Admins can use these sections.
        if current_user.role != "admin":
            raise HTTPException(
                status_code=403,
                detail="Admin access required"
            )

        # Check permission stored in PostgreSQL.
        permissions = current_user.section_permissions or {}

        if not permissions.get(section, False):
            raise HTTPException(
                status_code=403,
                detail=f"You do not have permission to access {section}."
            )

        return current_user

    return check_permission

# Only super admins can manage administrator accounts.
def require_super_admin(
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "super_admin":
        raise HTTPException(
            status_code=403,
            detail="Super admin access required"
        )

    return current_user


# --------------------------------------------------
# PASSWORD RESET OTP CONFIGURATION
# --------------------------------------------------

OTP_EXPIRE_MINUTES = 5
OTP_RESEND_COOLDOWN_SECONDS = 60
OTP_MAX_ATTEMPTS = 5


def hash_reset_otp(otp: str) -> str:
    secret = os.getenv("SECRET_KEY")

    if not secret:
        raise RuntimeError("SECRET_KEY is not configured.")

    return hmac.new(
        secret.encode(),
        otp.encode(),
        hashlib.sha256
    ).hexdigest()


def get_utc_datetime(value):
    """Normalize database timestamps for timezone-safe comparison."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


# --------------------------------------------------
# 8. REQUEST PASSWORD RESET OTP
# --------------------------------------------------

@router.post("/forgot-password")
def forgot_password(
    request: ForgotPasswordRequest,
    db: Session = Depends(get_db)
):
    generic_response = {
        "message": "If an account exists with this email, a password reset OTP will be sent."
    }

    email = str(request.email).strip().lower()

    user = db.query(User).filter(
        User.email == email,
        User.is_active == True
    ).first()

    # Do not reveal whether an account exists.
    if not user:
        return generic_response

    now = datetime.now(timezone.utc)

    latest_otp = db.query(PasswordResetOTP).filter(
        PasswordResetOTP.user_id == user.id
    ).order_by(
        PasswordResetOTP.created_at.desc(),
        PasswordResetOTP.id.desc()
    ).first()

    # Enforce resend cooldown.
    if latest_otp:
        last_sent = get_utc_datetime(latest_otp.last_sent_at)

        elapsed = (now - last_sent).total_seconds()

        if elapsed < OTP_RESEND_COOLDOWN_SECONDS:
            return generic_response

    try:
        # Invalidate all previous reset OTP records.
        db.query(PasswordResetOTP).filter(
            PasswordResetOTP.user_id == user.id,
            PasswordResetOTP.used_at.is_(None)
        ).update({
            PasswordResetOTP.used_at: now
        }, synchronize_session=False)

        # Generate a cryptographically secure six-digit OTP.
        otp = f"{secrets.randbelow(1_000_000):06d}"

        otp_record = PasswordResetOTP(
            user_id=user.id,
            otp_hash=hash_reset_otp(otp),
            attempts=0,
            expires_at=now + timedelta(
                minutes=OTP_EXPIRE_MINUTES
            ),
            last_sent_at=now
        )

        db.add(otp_record)
        db.commit()
        db.refresh(otp_record)

        try:
            send_email(
                recipient=user.email,
                title="G-MART Password Reset OTP",
                message=(
                    f"Your G-MART password reset OTP is: {otp}\n\n"
                    f"This OTP expires in {OTP_EXPIRE_MINUTES} minutes.\n"
                    "Do not share this OTP with anyone.\n\n"
                    "If you did not request a password reset, "
                    "please ignore this email."
                )
            )

        except Exception:
            # Invalidate the OTP if email delivery fails.
            otp_record.used_at = datetime.now(timezone.utc)
            db.commit()

            raise HTTPException(
                status_code=503,
                detail="Unable to send the reset email. Please try again later."
            )

        return generic_response

    except HTTPException:
        raise

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not process the password reset request."
        )


# --------------------------------------------------
# 9. VERIFY PASSWORD RESET OTP
# --------------------------------------------------

@router.post("/verify-reset-otp")
def verify_reset_otp(
    request: VerifyResetOTPRequest,
    db: Session = Depends(get_db)
):
    email = str(request.email).strip().lower()

    user = db.query(User).filter(
        User.email == email,
        User.is_active == True
    ).first()

    if not user:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired OTP."
        )

    otp_record = db.query(PasswordResetOTP).filter(
        PasswordResetOTP.user_id == user.id,
        PasswordResetOTP.used_at.is_(None)
    ).order_by(
        PasswordResetOTP.created_at.desc(),
        PasswordResetOTP.id.desc()
    ).with_for_update().first()

    if not otp_record:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired OTP."
        )

    now = datetime.now(timezone.utc)

    if get_utc_datetime(otp_record.expires_at) <= now:
        otp_record.used_at = now
        db.commit()

        raise HTTPException(
            status_code=400,
            detail="OTP has expired. Please request a new one."
        )

    if otp_record.attempts >= OTP_MAX_ATTEMPTS:
        otp_record.used_at = now
        db.commit()

        raise HTTPException(
            status_code=400,
            detail="Maximum OTP attempts exceeded. Request a new OTP."
        )

    submitted_hash = hash_reset_otp(request.otp)

    if not hmac.compare_digest(
        otp_record.otp_hash,
        submitted_hash
    ):
        otp_record.attempts += 1

        if otp_record.attempts >= OTP_MAX_ATTEMPTS:
            otp_record.used_at = now

        db.commit()

        raise HTTPException(
            status_code=400,
            detail="Invalid OTP."
        )

    otp_record.verified_at = now
    db.commit()

    return {
        "message": "OTP verified successfully. You can now reset your password."
    }


# --------------------------------------------------
# 10. RESET PASSWORD
# --------------------------------------------------

@router.post("/reset-password")
def reset_password(
    request: ResetPasswordRequest,
    db: Session = Depends(get_db)
):
    email = str(request.email).strip().lower()

    user = db.query(User).filter(
        User.email == email,
        User.is_active == True
    ).first()

    if not user:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired password reset request."
        )

    otp_record = db.query(PasswordResetOTP).filter(
        PasswordResetOTP.user_id == user.id,
        PasswordResetOTP.used_at.is_(None)
    ).order_by(
        PasswordResetOTP.created_at.desc(),
        PasswordResetOTP.id.desc()
    ).with_for_update().first()

    if not otp_record:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired password reset request."
        )

    now = datetime.now(timezone.utc)

    if (
        otp_record.verified_at is None
        or get_utc_datetime(otp_record.expires_at) <= now
        or otp_record.attempts >= OTP_MAX_ATTEMPTS
    ):
        raise HTTPException(
            status_code=400,
            detail="Please verify a valid OTP before resetting your password."
        )

    submitted_hash = hash_reset_otp(request.otp)

    if not hmac.compare_digest(
        otp_record.otp_hash,
        submitted_hash
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid password reset OTP."
        )

    try:
        # Update the password.
        user.hashed_password = hash_password(
            request.new_password
        )

        # Mark the OTP as used.
        otp_record.used_at = now

        # Invalidate all active refresh tokens.
        db.query(RefreshToken).filter(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None)
        ).update({
            RefreshToken.revoked_at: now
        }, synchronize_session=False)

        db.commit()

        return {
            "message": "Password reset successfully. Please log in with your new password."
        }

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not reset your password."
        )


# 1. Customer registration
@router.post("/register", response_model=UserResponse, status_code=201)
def register(
    user_data: UserCreate,
    db: Session = Depends(get_db)
):
    normalized_email = (
        str(user_data.email).lower()
        if user_data.email
        else None
    )

    # Check duplicate email only when provided.
    if normalized_email:
        existing_user = db.query(User).filter(
            User.email == normalized_email
        ).first()

        if existing_user:
            raise HTTPException(
                status_code=409,
                detail="Email already registered"
            )

    # Check duplicate phone only when provided.
    if user_data.phone:
        existing_phone = db.query(User).filter(
            User.phone == user_data.phone
        ).first()

        if existing_phone:
            raise HTTPException(
                status_code=409,
                detail="Phone number already registered"
            )

    new_user = User(
        full_name=user_data.full_name.strip(),
        email=normalized_email,
        phone=user_data.phone,
        hashed_password=hash_password(user_data.password),
        role="customer"
    )

    try:
        db.add(new_user)
        db.flush()

        preferences = NotificationPreference(
            user_id=new_user.id,
            in_app_enabled=True,
            email_enabled=True,
            sms_enabled=True
        )

        db.add(preferences)
        db.commit()
        db.refresh(new_user)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Email or phone number already registered"
        )

    except Exception:
        db.rollback()
        raise

    return new_user


# 2. Login using email or phone number
@router.post("/login")
def login(
    login_data: UserLogin,
    db: Session = Depends(get_db)
):
    identifier = login_data.identifier.strip()

    if "@" in identifier:
        user = db.query(User).filter(
            User.email == identifier.lower()
        ).first()
    else:
        user = db.query(User).filter(
            User.phone == identifier
        ).first()

    if not user or not verify_password(
        login_data.password,
        user.hashed_password
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email/phone number or password"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Account is inactive"
        )

    return generate_tokens(db, user)

# 3. Refresh access token
@router.post("/refresh")
def refresh_access_token(
    refresh_token: str,
    db: Session = Depends(get_db)
):
    token_hash = hash_refresh_token(refresh_token)

    record = db.query(RefreshToken).filter(
        RefreshToken.token_hash == token_hash
    ).with_for_update().first()

    now = datetime.now(timezone.utc)

    if not record or record.revoked_at is not None:
        raise HTTPException(
            status_code=401,
            detail="Invalid refresh token"
        )

    if record.expires_at <= now:
        record.revoked_at = now
        db.commit()

        raise HTTPException(
            status_code=401,
            detail="Refresh token expired"
        )

    user = db.query(User).filter(
        User.id == record.user_id
    ).first()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=401,
            detail="User not found or inactive"
        )

    record.revoked_at = now
    db.commit()

    return generate_tokens(db, user)


# 4. Get current profile
@router.get("/me", response_model=UserResponse)
def get_my_profile(
    current_user: User = Depends(get_current_user)
):
    return current_user


# 5. Update profile
@router.put("/me", response_model=UserResponse)
def update_profile(
    user_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if user_data.phone:
        existing_phone = db.query(User).filter(
            User.phone == user_data.phone,
            User.id != current_user.id
        ).first()

        if existing_phone:
            raise HTTPException(
                status_code=409,
                detail="Phone number already registered"
            )

    if user_data.full_name is not None:
        current_user.full_name = user_data.full_name.strip()

    if user_data.phone is not None:
        current_user.phone = user_data.phone

    db.commit()
    db.refresh(current_user)

    return current_user


# 6. Change password
@router.patch("/change-password")
def change_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not verify_password(
        password_data.old_password,
        current_user.hashed_password
    ):
        raise HTTPException(
            status_code=400,
            detail="Current password is incorrect"
        )

    current_user.hashed_password = hash_password(
        password_data.new_password
    )

    db.query(RefreshToken).filter(
        RefreshToken.user_id == current_user.id,
        RefreshToken.revoked_at.is_(None)
    ).update({
        RefreshToken.revoked_at: datetime.now(timezone.utc)
    })

    db.commit()

    return {"message": "Password changed successfully"}


# 7. Logout
@router.post("/logout")
def logout(
    refresh_token: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    record = db.query(RefreshToken).filter(
        RefreshToken.token_hash == hash_refresh_token(refresh_token),
        RefreshToken.user_id == current_user.id,
        RefreshToken.revoked_at.is_(None)
    ).first()

    if record:
        record.revoked_at = datetime.now(timezone.utc)
        db.commit()

    return {"message": "Logged out successfully"}
