
from decimal import Decimal, ROUND_HALF_UP, ROUND_CEILING, ROUND_DOWN

from fastapi import (
    APIRouter,
    Depends,
    HTTPException
)
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


router = APIRouter(
    prefix="/cart",
    tags=["Shopping Cart"]
)


# --------------------------------------------------
# CONSTANTS
# --------------------------------------------------

TWO_DECIMALS = Decimal("0.01")
QUANTITY_PRECISION = Decimal("0.000000000001")

DISCRETE_UNITS = {
    "piece",
    "packet",
    "bottle"
}

MEASUREMENT_UNITS = {
    "kg",
    "g",
    "litre",
    "ml"
}


# --------------------------------------------------
# HELPER: GET OR CREATE CUSTOMER CART
# --------------------------------------------------

def get_or_create_cart(
    db: Session,
    user_id: int
):
    cart = (
        db.query(Cart)
        .filter(Cart.user_id == user_id)
        .with_for_update()
        .first()
    )

    if not cart:
        cart = Cart(user_id=user_id)
        db.add(cart)
        db.flush()

    return cart


# --------------------------------------------------
# HELPER: CALCULATE DISCOUNTED UNIT PRICE
# --------------------------------------------------

def get_discounted_price(product: Product) -> Decimal:
    price = Decimal(str(product.price))

    discount = Decimal(
        str(product.discount_percentage or 0)
    )

    discounted_price = (
        price
        * (Decimal("1") - discount / Decimal("100"))
    )

    return discounted_price.quantize(
        TWO_DECIMALS,
        rounding=ROUND_HALF_UP
    )


# --------------------------------------------------
# HELPER: VALIDATE PRODUCT QUANTITY
# --------------------------------------------------

def validate_quantity(
    product: Product,
    quantity: Decimal
):
    if quantity <= 0:
        raise HTTPException(
            status_code=400,
            detail="Quantity must be greater than zero"
        )

    if product.unit in DISCRETE_UNITS:
        if quantity != quantity.to_integral_value():
            raise HTTPException(
                status_code=400,
                detail=(
                    f"{product.unit} products must have "
                    "whole-number quantities"
                )
            )

    elif product.unit not in MEASUREMENT_UNITS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported product unit"
        )


# --------------------------------------------------
# HELPER: CALCULATE QUANTITY FROM AMOUNT
# --------------------------------------------------

def calculate_quantity_from_amount(
    product: Product,
    amount: Decimal
) -> Decimal:

    if product.unit not in MEASUREMENT_UNITS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Amount-based purchases are only available "
                "for weight and volume products"
            )
        )

    if amount <= 0:
        raise HTTPException(
            status_code=400,
            detail="Amount must be greater than zero"
        )

    discounted_price = get_discounted_price(product)

    if discounted_price <= 0:
        raise HTTPException(
            status_code=400,
            detail="Product price must be greater than zero"
        )

    quantity = (
        amount / discounted_price
    ).quantize(
        QUANTITY_PRECISION,
        rounding=ROUND_DOWN
    )

    if quantity <= 0:
        raise HTTPException(
            status_code=400,
            detail="Entered amount is too small to purchase this product"
        )

    return quantity


# --------------------------------------------------
# HELPER: CALCULATE WHOLE-UNIT STOCK REQUIREMENT
# --------------------------------------------------

def get_stock_requirement(quantity: Decimal) -> int:
    return int(
        quantity.to_integral_value(
            rounding=ROUND_CEILING
        )
    )


# --------------------------------------------------
# HELPER: VALIDATE AVAILABLE STOCK
# --------------------------------------------------

def validate_stock(
    product: Product,
    quantity: Decimal
):
    required_stock = get_stock_requirement(quantity)

    if required_stock > product.stock:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient stock. Available stock: "
                f"{product.stock} {product.unit}"
            )
        )


# --------------------------------------------------
# HELPER: BUILD CART RESPONSE
# --------------------------------------------------

def build_cart_response(cart: Cart):
    items = []
    subtotal = Decimal("0.00")

    for item in cart.items:
        product = item.product

        if not product:
            continue

        unit_price = Decimal(str(product.price))

        discount = Decimal(
            str(product.discount_percentage or 0)
        )

        discounted_price = get_discounted_price(product)

        if item.purchase_mode == "amount":
            purchase_amount = Decimal(
                str(item.purchase_amount)
            )

            # Recalculate displayed quantity using the
            # current price while preserving the entered amount.
            quantity = calculate_quantity_from_amount(
                product,
                purchase_amount
            )

            line_total = purchase_amount

        else:
            quantity = Decimal(str(item.quantity))

            line_total = (
                discounted_price * quantity
            ).quantize(
                TWO_DECIMALS,
                rounding=ROUND_HALF_UP
            )

            purchase_amount = None

        subtotal += line_total

        items.append({
            "id": item.id,
            "product_id": product.id,
            "product_name": product.name,
            "image_url": product.image_url,
            "unit": product.unit,
            "unit_price": unit_price,
            "discount_percentage": discount,
            "discounted_price": discounted_price,
            "quantity": quantity,
            "purchase_mode": item.purchase_mode,
            "purchase_amount": purchase_amount,
            "line_total": line_total,
            "stock": product.stock,
            "is_available": product.is_available
        })

    subtotal = subtotal.quantize(
        TWO_DECIMALS,
        rounding=ROUND_HALF_UP
    )

    return {
        "id": cart.id,
        "user_id": cart.user_id,
        "items": items,
        "total_items": len(items),
        "subtotal": subtotal
    }


# --------------------------------------------------
# HELPER: LOAD CART WITH PRODUCTS
# --------------------------------------------------

def load_cart(
    db: Session,
    cart_id: int
):
    return (
        db.query(Cart)
        .options(
            joinedload(Cart.items).joinedload(
                CartItem.product
            )
        )
        .filter(Cart.id == cart_id)
        .first()
    )


# --------------------------------------------------
# 1. VIEW CART
# --------------------------------------------------

@router.get(
    "/",
    response_model=CartResponse
)
def get_cart(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        cart = get_or_create_cart(
            db,
            current_user.id
        )

        cart_id = cart.id

        db.commit()

        cart = load_cart(db, cart_id)

        return build_cart_response(cart)

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not retrieve cart"
        )


# --------------------------------------------------
# 2. ADD PRODUCT TO CART
# --------------------------------------------------

@router.post(
    "/items",
    response_model=CartResponse
)
def add_to_cart(
    item_data: CartItemAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        product = (
            db.query(Product)
            .filter(Product.id == item_data.product_id)
            .with_for_update()
            .first()
        )

        if not product:
            raise HTTPException(
                status_code=404,
                detail="Product not found"
            )

        if not product.is_available:
            raise HTTPException(
                status_code=400,
                detail="Product is unavailable"
            )

        if item_data.purchase_mode == "quantity":
            new_quantity = Decimal(
                str(item_data.quantity)
            )

            validate_quantity(
                product,
                new_quantity
            )

            new_amount = None

        else:
            new_amount = Decimal(
                str(item_data.amount)
            )

            new_quantity = calculate_quantity_from_amount(
                product,
                new_amount
            )

        cart = get_or_create_cart(
            db,
            current_user.id
        )

        cart_item = (
            db.query(CartItem)
            .filter(
                CartItem.cart_id == cart.id,
                CartItem.product_id == product.id
            )
            .with_for_update()
            .first()
        )

        if cart_item:
            if cart_item.purchase_mode != item_data.purchase_mode:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "This product is already in your cart "
                        "using another purchase mode. "
                        "Update the existing cart item instead."
                    )
                )

            if item_data.purchase_mode == "quantity":
                new_quantity += Decimal(
                    str(cart_item.quantity)
                )

            else:
                new_amount += Decimal(
                    str(cart_item.purchase_amount)
                )

                new_quantity = calculate_quantity_from_amount(
                    product,
                    new_amount
                )

        validate_stock(
            product,
            new_quantity
        )

        if cart_item:
            cart_item.quantity = new_quantity
            cart_item.purchase_amount = new_amount

        else:
            cart_item = CartItem(
                cart_id=cart.id,
                product_id=product.id,
                quantity=new_quantity,
                purchase_mode=item_data.purchase_mode,
                purchase_amount=new_amount
            )

            db.add(cart_item)

        cart_id = cart.id

        db.commit()

        cart = load_cart(db, cart_id)

        return build_cart_response(cart)

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not add product to cart"
        )


# --------------------------------------------------
# 3. UPDATE CART ITEM
# --------------------------------------------------

@router.patch(
    "/items/{product_id}",
    response_model=CartResponse
)
def update_cart_item(
    product_id: int,
    item_data: CartItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        cart = (
            db.query(Cart)
            .filter(Cart.user_id == current_user.id)
            .with_for_update()
            .first()
        )

        if not cart:
            raise HTTPException(
                status_code=404,
                detail="Cart not found"
            )

        product = (
            db.query(Product)
            .filter(Product.id == product_id)
            .with_for_update()
            .first()
        )

        if not product or not product.is_available:
            raise HTTPException(
                status_code=400,
                detail="Product is unavailable"
            )

        cart_item = (
            db.query(CartItem)
            .filter(
                CartItem.cart_id == cart.id,
                CartItem.product_id == product_id
            )
            .with_for_update()
            .first()
        )

        if not cart_item:
            raise HTTPException(
                status_code=404,
                detail="Cart item not found"
            )

        if item_data.purchase_mode == "quantity":
            new_quantity = Decimal(
                str(item_data.quantity)
            )

            validate_quantity(
                product,
                new_quantity
            )

            new_amount = None

        else:
            new_amount = Decimal(
                str(item_data.amount)
            )

            new_quantity = calculate_quantity_from_amount(
                product,
                new_amount
            )

        validate_stock(
            product,
            new_quantity
        )

        cart_item.quantity = new_quantity
        cart_item.purchase_mode = item_data.purchase_mode
        cart_item.purchase_amount = new_amount

        cart_id = cart.id

        db.commit()

        cart = load_cart(db, cart_id)

        return build_cart_response(cart)

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not update cart item"
        )


# --------------------------------------------------
# 4. REMOVE ONE PRODUCT FROM CART
# --------------------------------------------------

@router.delete(
    "/items/{product_id}",
    response_model=CartResponse
)
def remove_cart_item(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        cart = (
            db.query(Cart)
            .filter(Cart.user_id == current_user.id)
            .with_for_update()
            .first()
        )

        if not cart:
            raise HTTPException(
                status_code=404,
                detail="Cart not found"
            )

        cart_item = (
            db.query(CartItem)
            .filter(
                CartItem.cart_id == cart.id,
                CartItem.product_id == product_id
            )
            .with_for_update()
            .first()
        )

        if not cart_item:
            raise HTTPException(
                status_code=404,
                detail="Cart item not found"
            )

        db.delete(cart_item)

        cart_id = cart.id

        db.commit()

        cart = load_cart(db, cart_id)

        return build_cart_response(cart)

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not remove cart item"
        )


# --------------------------------------------------
# 5. CLEAR ENTIRE CART
# --------------------------------------------------

@router.delete(
    "/",
    response_model=CartResponse
)
def clear_cart(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        cart = (
            db.query(Cart)
            .filter(Cart.user_id == current_user.id)
            .with_for_update()
            .first()
        )

        if not cart:
            raise HTTPException(
                status_code=404,
                detail="Cart not found"
            )

        db.query(CartItem).filter(
            CartItem.cart_id == cart.id
        ).delete(
            synchronize_session=False
        )

        cart_id = cart.id

        db.commit()

        cart = load_cart(db, cart_id)

        return build_cart_response(cart)

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not clear cart"
        )
