
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../../context/CartContext";

const DISCRETE_UNITS = ["piece", "packet", "bottle"];
const MEASUREMENT_UNITS = ["kg", "g", "litre", "ml"];

function Cart() {
  const navigate = useNavigate();

  const {
    items,
    subtotal,
    updateCartItem,
    removeFromCart,
    clearCart,
  } = useCart();

  const getUnitPrice = (
    price: string | number,
    discount: string | number
  ) => {
    const originalPrice = Number(price);
    const discountPercentage = Number(discount || 0);

    return originalPrice * (1 - discountPercentage / 100);
  };

  return (
    <div className="min-h-screen bg-ivory text-navy">

      {/* HEADER */}
      <header className="bg-navy px-6 py-5 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link to="/" className="text-2xl font-bold">
            G-<span className="text-champagne">MART</span>
          </Link>

          <Link to="/" className="hover:text-champagne">
            Continue Shopping
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-12">

        {/* PAGE TITLE */}
        <div className="mb-8">
          <p className="font-semibold uppercase tracking-widest text-champagne">
            Your shopping
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Shopping Cart
          </h1>

          <p className="mt-2 text-gray-500">
            {items.length} products in your cart
          </p>
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl bg-white p-12 text-center shadow-sm">
            <div className="text-6xl">🛒</div>

            <h2 className="mt-5 text-2xl font-bold">
              Your cart is empty
            </h2>

            <p className="mt-2 text-gray-500">
              Add some products to get started.
            </p>

            <Link
              to="/"
              className="mt-6 inline-block rounded-lg bg-navy px-6 py-3 font-semibold text-white hover:bg-champagne hover:text-navy"
            >
              Start Shopping
            </Link>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-3">

            {/* CART ITEMS */}
            <div className="space-y-4 lg:col-span-2">

              {items.map((item) => {
                const product = item.product;

                const unitPrice = getUnitPrice(
                  product.price,
                  product.discount_percentage
                );

                const isDiscrete = DISCRETE_UNITS.includes(
                  product.unit.toLowerCase()
                );

                const canBuyByAmount =
                  product.allow_purchase_by_amount &&
                  MEASUREMENT_UNITS.includes(product.unit.toLowerCase());

                const lineTotal =
                  item.purchase_mode === "amount"
                    ? Number(item.purchase_amount || 0)
                    : unitPrice * item.quantity;

                return (
                  <div
                    key={product.id}
                    className="flex flex-col gap-5 rounded-xl bg-white p-5 shadow-sm sm:flex-row"
                  >

                    {/* IMAGE */}
                    {/* CLICKABLE PRODUCT IMAGE */}
                    <Link
                      to={`/products/${product.id}`}
                      className="flex h-28 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 transition hover:opacity-80 sm:w-28"
                      title={`View ${product.name}`}
                    >
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span className="text-5xl">🛍️</span>
                      )}
                    </Link>

                    {/* DETAILS */}
                    <div className="flex flex-1 flex-col justify-between gap-4">

                      <div className="flex flex-wrap justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase text-gray-400">
                            {product.category}
                          </p>

                          <h3 className="mt-1 text-lg font-bold">
                            {product.name}
                          </h3>

                          <p className="mt-1 text-sm text-gray-500">
                            ₹{unitPrice.toFixed(2)} per {product.unit}
                          </p>
                        </div>

                        <p className="font-bold">
                          ₹{lineTotal.toFixed(2)}
                        </p>
                      </div>

                      {/* PURCHASE METHOD */}
                      {canBuyByAmount && (
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-gray-500">
                            Purchase method
                          </label>

                          <select
                            value={item.purchase_mode}
                            onChange={(e) => {
                              const newMode = e.target.value as
                                | "quantity"
                                | "amount";

                              if (newMode === "amount") {
                                const currentAmount = Number(
                                  (unitPrice * item.quantity).toFixed(2)
                                );

                                updateCartItem(
                                  product.id,
                                  "amount",
                                  currentAmount
                                );
                              } else {
                                updateCartItem(
                                  product.id,
                                  "quantity",
                                  item.quantity
                                );
                              }
                            }}
                            className="w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:border-champagne"
                          >
                            <option value="quantity">
                              Buy by Quantity
                            </option>

                            <option value="amount">
                              Buy by Amount (₹)
                            </option>
                          </select>
                        </div>
                      )}

                      {/* QUANTITY MODE */}
                      {item.purchase_mode === "quantity" && (
                        <div>
                          <label
                            htmlFor={`quantity-${product.id}`}
                            className="mb-1 block text-xs font-semibold text-gray-500"
                          >
                            Quantity ({product.unit})
                          </label>

                          <input
                            id={`quantity-${product.id}`}
                            type="number"
                            min={isDiscrete ? "1" : "0.01"}
                            max={product.stock}
                            step={isDiscrete ? "1" : "0.01"}
                            value={item.quantity}
                            onChange={(e) => {
                              const value = Number(e.target.value);

                              if (
                                value > 0 &&
                                (!isDiscrete || Number.isInteger(value))
                              ) {
                                updateCartItem(
                                  product.id,
                                  "quantity",
                                  value
                                );
                              }
                            }}
                            className="w-32 rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-champagne"
                          />

                          <p className="mt-1 text-xs text-gray-400">
                            Available stock: {product.stock} {product.unit}
                          </p>
                        </div>
                      )}

                      {/* AMOUNT MODE */}
                      {item.purchase_mode === "amount" && (
                        <div>
                          <label
                            htmlFor={`amount-${product.id}`}
                            className="mb-1 block text-xs font-semibold text-gray-500"
                          >
                            Amount (₹)
                          </label>

                          <input
                            id={`amount-${product.id}`}
                            type="number"
                            min="1"
                            step="0.01"
                            value={item.purchase_amount ?? ""}
                            onChange={(e) => {
                              const value = Number(e.target.value);

                              if (value > 0) {
                                updateCartItem(
                                  product.id,
                                  "amount",
                                  value
                                );
                              }
                            }}
                            className="w-32 rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-champagne"
                          />

                          <p className="mt-2 text-sm text-gray-600">
                            Approx. quantity:{" "}
                            <strong>
                              {item.quantity.toFixed(3)} {product.unit}
                            </strong>
                          </p>
                        </div>
                      )}

                      {/* REMOVE */}
                      <div className="flex justify-end">
                        <button
                          onClick={() => removeFromCart(product.id)}
                          className="text-sm font-semibold text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>

                    </div>
                  </div>
                );
              })}

              {/* CLEAR CART */}
              <button
                onClick={clearCart}
                className="text-sm font-semibold text-red-500 hover:text-red-700"
              >
                Clear Entire Cart
              </button>

            </div>

            {/* ORDER SUMMARY */}
            <div className="h-fit rounded-xl bg-white p-6 shadow-sm">

              <h2 className="text-xl font-bold">
                Order Summary
              </h2>

              <div className="mt-6 flex justify-between text-sm">
                <span className="text-gray-500">Products</span>
                <span>{items.length}</span>
              </div>

              <div className="mt-4 flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>

              <div className="my-5 border-t border-gray-200" />

              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>

              <p className="mt-4 text-xs text-gray-400">
                Delivery fees and applicable discounts will be confirmed at checkout.
              </p>

              {/* PROCEED TO CHECKOUT */}
              <button
                onClick={() => navigate("/checkout")}
                className="mt-6 w-full rounded-lg bg-navy px-5 py-3 font-semibold text-white hover:bg-navy-secondary"
              >
                Proceed to Checkout
              </button>

              <Link
                to="/"
                className="mt-4 block text-center text-sm font-semibold text-navy hover:text-champagne"
              >
                Continue Shopping
              </Link>

            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default Cart;
