
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models.inventory_movement import InventoryMovement
from app.models.user import User
from app.routers.auth import require_section_access


router = APIRouter(
    prefix="/inventory",
    tags=["Inventory Management"]
)


@router.get("/movements")
def get_inventory_movements(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    product_id: Optional[int] = Query(None, ge=1),
    movement_type: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("inventory"))
):
    query = (
        db.query(
            InventoryMovement,
            User.full_name
        )
        .outerjoin(
            User,
            InventoryMovement.changed_by_user_id == User.id
        )
    )

    if product_id is not None:
        query = query.filter(
            InventoryMovement.product_id == product_id
        )

    if movement_type:
        query = query.filter(
            InventoryMovement.movement_type == movement_type
        )

    records = (
        query
        .order_by(InventoryMovement.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return [
        {
            "id": movement.id,
            "product_id": movement.product_id,
            "product_name": movement.product_name,
            "quantity_change": movement.quantity_change,
            "previous_stock": movement.previous_stock,
            "new_stock": movement.new_stock,
            "movement_type": movement.movement_type,
            "reason": movement.reason,
            "changed_by_user_id": movement.changed_by_user_id,
            "changed_by_name": admin_name,
            "order_id": movement.order_id,
            "created_at": movement.created_at
        }
        for movement, admin_name in records
    ]


@router.get("/summary")
def get_inventory_summary(
    db: Session = Depends(get_db),
    admin: User = Depends(require_section_access("inventory"))
):
    total_movements = db.query(
        InventoryMovement
    ).count()

    stock_added = sum(
        row[0] or 0
        for row in db.query(
            InventoryMovement.quantity_change
        ).filter(
            InventoryMovement.quantity_change > 0
        ).all()
    )

    stock_removed = abs(sum(
        row[0] or 0
        for row in db.query(
            InventoryMovement.quantity_change
        ).filter(
            InventoryMovement.quantity_change < 0
        ).all()
    ))

    return {
        "total_movements": total_movements,
        "stock_added": stock_added,
        "stock_removed": stock_removed
    }
