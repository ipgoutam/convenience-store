
import secrets
import hashlib

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models.user import User
from app.models.admin_invite import AdminInvite
from app.models.refresh_token import RefreshToken

from app.schemas.admin_invite import (
    AdminInviteCreate,
    AdminInviteAccept,
    AdminInviteResponse,
    AdminAccountResponse
)

from app.auth.security import hash_password
from app.routers.auth import (
    require_super_admin
)


router = APIRouter(
    prefix="/admin/management",
    tags=["Admin Management"]
)

INVITE_EXPIRE_HOURS = 48


def hash_invite_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# --------------------------------------------------
# 1. CREATE ADMIN INVITATION
# --------------------------------------------------

@router.post("/invites", response_model=AdminInviteResponse)
def create_admin_invite(
    invite_data: AdminInviteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    email = str(invite_data.email).lower()

    existing_user = db.query(User).filter(
        User.email == email
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists"
        )

    now = datetime.now(timezone.utc)

    existing_invite = db.query(AdminInvite).filter(
        AdminInvite.email == email,
        AdminInvite.used_at.is_(None),
        AdminInvite.revoked_at.is_(None),
        AdminInvite.expires_at > now
    ).first()

    if existing_invite:
        raise HTTPException(
            status_code=409,
            detail="An active invitation already exists for this email"
        )

    token = secrets.token_urlsafe(32)

    invitation = AdminInvite(
        email=email,
        token_hash=hash_invite_token(token),
        created_by=current_user.id,
        expires_at=now + timedelta(hours=INVITE_EXPIRE_HOURS)
    )

    db.add(invitation)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Unable to create invitation"
        )

    return {
        "email": email,
        "invitation_token": token,
        "expires_in_hours": INVITE_EXPIRE_HOURS
    }


# --------------------------------------------------
# 2. ACCEPT ADMIN INVITATION
# --------------------------------------------------

@router.post("/invites/accept", response_model=AdminAccountResponse)
def accept_admin_invite(
    invite_data: AdminInviteAccept,
    db: Session = Depends(get_db)
):
    token_hash = hash_invite_token(invite_data.token)

    invitation = (
        db.query(AdminInvite)
        .filter(AdminInvite.token_hash == token_hash)
        .with_for_update()
        .first()
    )

    if not invitation:
        raise HTTPException(
            status_code=404,
            detail="Invalid invitation"
        )

    now = datetime.now(timezone.utc)

    if invitation.used_at is not None:
        raise HTTPException(
            status_code=400,
            detail="Invitation has already been used"
        )

    if invitation.revoked_at is not None:
        raise HTTPException(
            status_code=400,
            detail="Invitation has been revoked"
        )

    if invitation.expires_at <= now:
        raise HTTPException(
            status_code=400,
            detail="Invitation has expired"
        )

    email = invitation.email.lower()

    existing_user = db.query(User).filter(
        User.email == email
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists"
        )

    new_admin = User(
        full_name=invite_data.full_name.strip(),
        email=email,
        phone=invite_data.phone,
        hashed_password=hash_password(invite_data.password),
        role="admin",
        is_active=True
    )

    try:
        db.add(new_admin)
        db.flush()

        invitation.used_at = now

        db.commit()
        db.refresh(new_admin)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Email or phone number already registered"
        )

    return new_admin


# --------------------------------------------------
# 3. LIST ADMIN ACCOUNTS
# --------------------------------------------------

@router.get("/admins", response_model=list[AdminAccountResponse])
def list_admins(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    return (
        db.query(User)
        .filter(User.role.in_(["admin", "super_admin"]))
        .order_by(User.created_at.desc())
        .all()
    )


# --------------------------------------------------
# 4. DEACTIVATE ADMIN ACCOUNT
# --------------------------------------------------

@router.patch("/admins/{admin_id}/deactivate")
def deactivate_admin(
    admin_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    admin = db.query(User).filter(
        User.id == admin_id
    ).with_for_update().first()

    if not admin or admin.role not in ["admin", "super_admin"]:
        raise HTTPException(
            status_code=404,
            detail="Admin account not found"
        )

    if admin.id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="You cannot deactivate your own account"
        )

    if not admin.is_active:
        raise HTTPException(
            status_code=400,
            detail="Admin account is already inactive"
        )

    if admin.role == "super_admin":
        active_super_admins = (
            db.query(User)
            .filter(
                User.role == "super_admin",
                User.is_active.is_(True)
            )
            .with_for_update()
            .all()
        )

        if len(active_super_admins) <= 1:
            raise HTTPException(
                status_code=400,
                detail="Cannot deactivate the last active super admin"
            )

    admin.is_active = False

    # Revoke all active refresh tokens.
    db.query(RefreshToken).filter(
        RefreshToken.user_id == admin.id,
        RefreshToken.revoked_at.is_(None)
    ).update({
        RefreshToken.revoked_at: datetime.now(timezone.utc)
    })

    db.commit()

    return {"message": "Admin account deactivated successfully"}


# --------------------------------------------------
# 5. REACTIVATE ADMIN ACCOUNT
# --------------------------------------------------

@router.patch("/admins/{admin_id}/activate")
def activate_admin(
    admin_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    admin = db.query(User).filter(
        User.id == admin_id
    ).first()

    if not admin or admin.role not in ["admin", "super_admin"]:
        raise HTTPException(
            status_code=404,
            detail="Admin account not found"
        )

    if admin.is_active:
        raise HTTPException(
            status_code=400,
            detail="Admin account is already active"
        )

    admin.is_active = True
    db.commit()

    return {"message": "Admin account activated successfully"}


# --------------------------------------------------
# 6. REVOKE AN UNUSED INVITATION
# --------------------------------------------------

@router.delete("/invites/{invite_id}")
def revoke_admin_invite(
    invite_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    invitation = db.query(AdminInvite).filter(
        AdminInvite.id == invite_id
    ).with_for_update().first()

    if not invitation:
        raise HTTPException(
            status_code=404,
            detail="Invitation not found"
        )

    if invitation.used_at is not None:
        raise HTTPException(
            status_code=400,
            detail="Used invitations cannot be revoked"
        )

    if invitation.revoked_at is not None:
        raise HTTPException(
            status_code=400,
            detail="Invitation is already revoked"
        )

    invitation.revoked_at = datetime.now(timezone.utc)
    db.commit()

    return {"message": "Invitation revoked successfully"}
