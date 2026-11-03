
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.cart import Cart, CartItem
from app.models.product import Product
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.cart import (
    CartItemAdd,
    CartItemUpdate,
    CartResponse
)

router = APIRouter(prefix="/cart", tags=["Shopping Cart"])


def get_or_create_cart(db: Session, user_id: int):
    cart = db.query(Cart).filter(Cart.user_id == user_id).first()

    if not cart:
        cart = Cart(user_id=user_id)
        db.add(cart)
        db.flush()

    return cart


def build_cart_response(cart: Cart):
    items = []
    subtotal = 0.0
    total_items = 0

    for item in cart.items:
        product = item.product

        if not product:
            continue

        unit_price = float(product.price)
        discount = float(product.discount_percentage or 0)

        discounted_price = round(
            unit_price * (1 - discount / 100), 2
        )

        line_total = round(discounted_price * item.quantity, 2)

        subtotal += line_total
        total_items += item.quantity

        items.append({
            "id": item.id,
            "product_id": product.id,
            "product_name": product.name,
            "image_url": product.image_url,
            "unit_price": unit_price,
            "discount_percentage": discount,
            "discounted_price": discounted_price,
            "quantity": item.quantity,
            "line_total": line_total,
            "stock": product.stock,
            "is_available": product.is_available
        })

    return {
        "id": cart.id,
        "user_id": cart.user_id,
        "items": items,
        "total_items": total_items,
        "subtotal": round(subtotal, 2)
    }


# View cart
@router.get("/", response_model=CartResponse)
def get_cart(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cart = get_or_create_cart(db, current_user.id)

    db.commit()

    cart = (
        db.query(Cart)
        .options(
            joinedload(Cart.items).joinedload(CartItem.product)
        )
        .filter(Cart.id == cart.id)
        .first()
    )

    return build_cart_response(cart)


# Add product to cart
@router.post("/items", response_model=CartResponse)
def add_to_cart(
    item_data: CartItemAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    product = db.query(Product).filter(
        Product.id == item_data.product_id
    ).first()

    if not product:
        raise HTTPException(404, detail="Product not found")

    if not product.is_available:
        raise HTTPException(400, detail="Product is unavailable")

    cart = get_or_create_cart(db, current_user.id)

    cart_item = db.query(CartItem).filter(
        CartItem.cart_id == cart.id,
        CartItem.product_id == product.id
    ).first()

    new_quantity = item_data.quantity

    if cart_item:
        new_quantity += cart_item.quantity

    if new_quantity > product.stock:
        raise HTTPException(
            400,
            detail=f"Only {product.stock} units available"
        )

    if cart_item:
        cart_item.quantity = new_quantity
    else:
        cart_item = CartItem(
            cart_id=cart.id,
            product_id=product.id,
            quantity=new_quantity
        )
        db.add(cart_item)

    db.commit()

    cart = (
        db.query(Cart)
        .options(
            joinedload(Cart.items).joinedload(CartItem.product)
        )
        .filter(Cart.id == cart.id)
        .first()
    )

    return build_cart_response(cart)


# Update product quantity
@router.patch("/items/{product_id}", response_model=CartResponse)
def update_cart_item(
    product_id: int,
    item_data: CartItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cart = db.query(Cart).filter(
        Cart.user_id == current_user.id
    ).first()

    if not cart:
        raise HTTPException(404, detail="Cart not found")

    cart_item = db.query(CartItem).filter(
        CartItem.cart_id == cart.id,
        CartItem.product_id == product_id
    ).first()

    if not cart_item:
        raise HTTPException(404, detail="Cart item not found")

    product = db.query(Product).filter(
        Product.id == product_id
    ).first()

    if not product or not product.is_available:
        raise HTTPException(400, detail="Product is unavailable")

    if item_data.quantity > product.stock:
        raise HTTPException(
            400,
            detail=f"Only {product.stock} units available"
        )

    cart_item.quantity = item_data.quantity
    db.commit()

    cart = (
        db.query(Cart)
        .options(
            joinedload(Cart.items).joinedload(CartItem.product)
        )
        .filter(Cart.id == cart.id)
        .first()
    )

    return build_cart_response(cart)


# Remove one product from cart
@router.delete("/items/{product_id}", response_model=CartResponse)
def remove_cart_item(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cart = db.query(Cart).filter(
        Cart.user_id == current_user.id
    ).first()

    if not cart:
        raise HTTPException(404, detail="Cart not found")

    cart_item = db.query(CartItem).filter(
        CartItem.cart_id == cart.id,
        CartItem.product_id == product_id
    ).first()

    if not cart_item:
        raise HTTPException(404, detail="Cart item not found")

    db.delete(cart_item)
    db.commit()

    cart = (
        db.query(Cart)
        .options(
            joinedload(Cart.items).joinedload(CartItem.product)
        )
        .filter(Cart.id == cart.id)
        .first()
    )

    return build_cart_response(cart)


# Clear entire cart
@router.delete("/", response_model=CartResponse)
def clear_cart(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cart = db.query(Cart).filter(
        Cart.user_id == current_user.id
    ).first()

    if not cart:
        raise HTTPException(404, detail="Cart not found")

    db.query(CartItem).filter(
        CartItem.cart_id == cart.id
    ).delete(synchronize_session=False)

    db.commit()

    cart = (
        db.query(Cart)
        .options(
            joinedload(Cart.items).joinedload(CartItem.product)
        )
        .filter(Cart.id == cart.id)
        .first()
    )

    return build_cart_response(cart)
