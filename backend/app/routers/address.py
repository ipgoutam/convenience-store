
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.address import Address
from app.models.user import User
from app.schemas.address import (
    AddressCreate,
    AddressUpdate,
    AddressResponse
)
from app.routers.auth import get_current_user


router = APIRouter(
    prefix="/addresses",
    tags=["Customer Addresses"]
)


# CUSTOMER: Get all saved addresses
@router.get("/", response_model=list[AddressResponse])
def get_addresses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return (
        db.query(Address)
        .filter(Address.user_id == current_user.id)
        .order_by(Address.is_default.desc(), Address.id.desc())
        .all()
    )


# CUSTOMER: Add a new address
@router.post(
    "/",
    response_model=AddressResponse,
    status_code=status.HTTP_201_CREATED
)
def create_address(
    address_data: AddressCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        # Check whether the customer already has an address
        existing_address = db.query(Address).filter(
            Address.user_id == current_user.id
        ).first()

        # Make the first address the default automatically
        if not existing_address:
            address_data.is_default = True
        if address_data.is_default:
            db.query(Address).filter(
                Address.user_id == current_user.id
            ).update({"is_default": False})

        address = Address(
            **address_data.model_dump(),
            user_id=current_user.id
        )

        db.add(address)
        db.commit()
        db.refresh(address)

        return address

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not create address"
        )


# CUSTOMER: Get one address
@router.get("/{address_id}", response_model=AddressResponse)
def get_address(
    address_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    address = db.query(Address).filter(
        Address.id == address_id,
        Address.user_id == current_user.id
    ).first()

    if not address:
        raise HTTPException(
            status_code=404,
            detail="Address not found"
        )

    return address


# CUSTOMER: Update an address
@router.put("/{address_id}", response_model=AddressResponse)
def update_address(
    address_id: int,
    address_data: AddressUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    address = db.query(Address).filter(
        Address.id == address_id,
        Address.user_id == current_user.id
    ).first()

    if not address:
        raise HTTPException(
            status_code=404,
            detail="Address not found"
        )

    update_data = address_data.model_dump(exclude_unset=True)

    required_fields = {
        "label", "recipient_name", "phone",
        "address_line", "city", "state", "pincode"
    }

    for field in required_fields:
        if field in update_data and update_data[field] is None:
            raise HTTPException(
                status_code=400,
                detail=f"{field} cannot be null"
            )

    try:
        if update_data.get("is_default") is True:
            db.query(Address).filter(
                Address.user_id == current_user.id,
                Address.id != address_id
            ).update({"is_default": False})

        for field, value in update_data.items():
            setattr(address, field, value)

        db.commit()
        db.refresh(address)

        return address

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not update address"
        )


# CUSTOMER: Delete an address
@router.delete("/{address_id}")
def delete_address(
    address_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    address = db.query(Address).filter(
        Address.id == address_id,
        Address.user_id == current_user.id
    ).first()

    if not address:
        raise HTTPException(
            status_code=404,
            detail="Address not found"
        )

    try:
        was_default = address.is_default

        db.delete(address)
        db.flush()

        # Assign another address as default if necessary
        if was_default:
            next_address = db.query(Address).filter(
                Address.user_id == current_user.id
            ).order_by(Address.id.asc()).first()

            if next_address:
                next_address.is_default = True

        db.commit()

        
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not delete address"
        )


# CUSTOMER: Set an address as default
@router.patch("/{address_id}/default", response_model=AddressResponse)
def set_default_address(
    address_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    address = db.query(Address).filter(
        Address.id == address_id,
        Address.user_id == current_user.id
    ).first()

    if not address:
        raise HTTPException(
            status_code=404,
            detail="Address not found"
        )

    try:
        db.query(Address).filter(
            Address.user_id == current_user.id
        ).update({"is_default": False})

        address.is_default = True

        db.commit()
        db.refresh(address)

        return address

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not set default address"
        )
