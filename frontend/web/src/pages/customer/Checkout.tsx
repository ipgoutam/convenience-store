
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import api from "../../services/api";
import type { Address } from "../../types/address";
import { formatAddress } from "../../types/address";

type DeliveryType = "pickup" | "delivery";
type PaymentMethod = "cash" | "online";

interface OrderResponse {
  id: number;
  order_number: string;
  total_amount: number | string;
  order_status: string;
  payment_status: string;
}

interface StoreSettings {
  store_name?: string;
  delivery_fee: number | string;
  online_payment_enabled?: boolean;
  is_open?: boolean;
  opening_time?: string;
  closing_time?: string;
}

interface CouponResponse {
  valid: boolean;
  message?: string;
  coupon_code: string;
  discount_type: string;
  discount_value: number | string;
  subtotal: number | string;
  delivery_fee: number | string;
  discount_amount: number | string;
  total_amount: number | string;
}

function Checkout() {
  const { user, loading } = useAuth();
  const { items, subtotal, clearCart } = useCart();
  const navigate = useNavigate();

  const [deliveryType, setDeliveryType] =
    useState<DeliveryType>("pickup");

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("cash");

  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("new");
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [addressesError, setAddressesError] = useState("");
  const [notes, setNotes] = useState("");
  const [couponCode, setCouponCode] = useState("");

  const [coupon, setCoupon] =
    useState<CouponResponse | null>(null);

  const [couponLoading, setCouponLoading] = useState(false);
  const [couponMessage, setCouponMessage] = useState("");
  const [couponError, setCouponError] = useState("");

  const [storeSettings, setStoreSettings] =
    useState<StoreSettings | null>(null);

  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState("");

  const [placingOrder, setPlacingOrder] = useState(false);
  const [error, setError] = useState("");

  // Fetch the existing store settings, including delivery fee.
  useEffect(() => {
    const fetchStoreSettings = async () => {
      try {
        setSettingsLoading(true);
        setSettingsError("");

        const response = await api.get<StoreSettings>(
          "/store/settings"
        );

        setStoreSettings(response.data);
      } catch {
        setSettingsError("Unable to load store delivery settings.");
      } finally {
        setSettingsLoading(false);
      }
    };

    fetchStoreSettings();
  }, []);

  // Load the customer's saved addresses and preselect the default address.
  useEffect(() => {
    if (!user) return;

    let active = true;

    const fetchAddresses = async () => {
      try {
        setAddressesLoading(true);
        setAddressesError("");

        const response = await api.get<Address[]>("/addresses/");

        if (!active) return;

        setSavedAddresses(response.data);

        const defaultAddress =
          response.data.find((address) => address.is_default) ||
          response.data[0];

        if (defaultAddress) {
          setSelectedAddressId(String(defaultAddress.id));
          setDeliveryAddress(formatAddress(defaultAddress));
          setCustomerPhone(defaultAddress.phone);
        } else {
          setSelectedAddressId("new");
        }
      } catch {
        if (active) {
          setAddressesError("Unable to load saved addresses. You can enter your address manually.");
          setSelectedAddressId("new");
        }
      } finally {
        if (active) {
          setAddressesLoading(false);
        }
      }
    };

    fetchAddresses();

    return () => {
      active = false;
    };
  }, [user?.id]);

  // Pickup is always free. Delivery uses the configured store fee.
  const deliveryFee =
    deliveryType === "delivery" && storeSettings
      ? Number(storeSettings.delivery_fee)
      : 0;

  const discountAmount = coupon
    ? Number(coupon.discount_amount)
    : 0;

  // Use the server's calculated total when a coupon is applied.
  const estimatedTotal = coupon
    ? Number(coupon.total_amount)
    : Math.max(0, subtotal + deliveryFee);

  const handleDeliveryChange = (type: DeliveryType) => {
    setDeliveryType(type);

    // A coupon must be checked again when the delivery method changes.
    setCoupon(null);
    setCouponMessage("");
    setCouponError("");
    setError("");
  };

  const handleApplyCoupon = async () => {
    setCouponError("");
    setCouponMessage("");
    setCoupon(null);

    const code = couponCode.trim();

    if (!code) {
      setCouponError("Please enter a coupon code.");
      return;
    }

    if (subtotal <= 0) {
      setCouponError("Your order amount must be greater than zero.");
      return;
    }

    try {
      setCouponLoading(true);

      const response = await api.post<CouponResponse>(
        "/orders/validate-coupon",
        {
          coupon_code: code,
          delivery_type: deliveryType,
        }
      );

      if (!response.data.valid) {
        setCouponError(
          response.data.message || "This coupon is not valid."
        );
        return;
      }

      setCoupon(response.data);
      setCouponCode(response.data.coupon_code);
      setCouponMessage(
        response.data.message || "Coupon applied successfully!"
      );
    } catch (err: unknown) {
      const apiError = err as {
        response?: {
          data?: {
            detail?: string;
          };
        };
      };

      setCouponError(
        apiError.response?.data?.detail ||
          "Unable to validate coupon. Please try again."
      );
    } finally {
      setCouponLoading(false);
    }
  };

  const handleSavedAddressChange = (value: string) => {
    setSelectedAddressId(value);
    setError("");

    if (value === "new") {
      setDeliveryAddress("");
      setCustomerPhone(user?.phone || "");
      return;
    }

    const selectedAddress = savedAddresses.find(
      (address) => String(address.id) === value
    );

    if (selectedAddress) {
      setDeliveryAddress(formatAddress(selectedAddress));
      setCustomerPhone(selectedAddress.phone);
    }
  };

  const handlePlaceOrder = async () => {
    setError("");

    if (!user) {
      navigate("/login");
      return;
    }

    if (items.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    if (deliveryType === "delivery") {
      if (!deliveryAddress.trim()) {
        setError("Please enter your delivery address.");
        return;
      }

      if (!/^[0-9]{10}$/.test(customerPhone.trim())) {
        setError("Please enter a valid 10-digit phone number.");
        return;
      }
    }

    if (paymentMethod === "online") {
      setError("Online payment is not available yet. Please select cash.");
      return;
    }

    const orderData = {
      delivery_type: deliveryType,
      delivery_address:
        deliveryType === "delivery"
          ? deliveryAddress.trim()
          : null,
      customer_phone:
        deliveryType === "delivery"
          ? customerPhone.trim()
          : null,
      payment_method: paymentMethod,
      notes: notes.trim() || null,
      coupon_code: coupon ? coupon.coupon_code : null,
    };

    try {
      setPlacingOrder(true);

      const response = await api.post<OrderResponse>(
        "/orders/",
        orderData
      );

      // Clear the frontend cart after successful order placement.
      clearCart();

      navigate(`/order-success/${response.data.id}`, {
        state: { order: response.data },
      });
    } catch (err: unknown) {
      const apiError = err as {
        response?: {
          data?: {
            detail?: string;
          };
        };
      };

      setError(
        apiError.response?.data?.detail ||
          "Unable to place your order. Please try again."
      );
    } finally {
      setPlacingOrder(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-ivory p-8 text-center">
        <h2 className="text-2xl font-bold text-navy">
          Please login to continue
        </h2>

        <Link
          to="/login"
          className="mt-4 inline-block rounded-lg bg-navy px-6 py-3 text-white"
        >
          Login
        </Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-ivory p-8 text-center">
        <h2 className="text-2xl font-bold text-navy">
          Your cart is empty
        </h2>

        <Link
          to="/"
          className="mt-4 inline-block text-navy underline"
        >
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ivory px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-navy">
            Checkout
          </h1>

          <Link
            to="/cart"
            className="text-sm font-medium text-navy underline"
          >
            Back to Cart
          </Link>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Delivery option */}
            <section className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold text-navy">
                1. Delivery Method
              </h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleDeliveryChange("pickup")}
                  className={`rounded-lg border p-4 text-left ${
                    deliveryType === "pickup"
                      ? "border-champagne bg-ivory"
                      : "border-gray-200"
                  }`}
                >
                  <span className="font-semibold text-navy">
                    Store Pickup
                  </span>

                  <p className="mt-1 text-sm text-gray-500">
                    Collect your order from our store.
                  </p>

                  <p className="mt-2 font-medium text-green-700">
                    No delivery fee
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleDeliveryChange("delivery")}
                  className={`rounded-lg border p-4 text-left ${
                    deliveryType === "delivery"
                      ? "border-champagne bg-ivory"
                      : "border-gray-200"
                  }`}
                >
                  <span className="font-semibold text-navy">
                    Home Delivery
                  </span>

                  <p className="mt-1 text-sm text-gray-500">
                    Get your order delivered to your address.
                  </p>

                  <p className="mt-2 text-sm font-medium text-navy">
                    {settingsLoading
                      ? "Loading delivery fee..."
                      : settingsError
                        ? "Delivery fee unavailable"
                        : `Delivery fee: ₹${Number(
                            storeSettings?.delivery_fee || 0
                          ).toFixed(2)}`}
                  </p>
                </button>
              </div>

              {deliveryType === "delivery" && (
                <div className="mt-5 space-y-4">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <label className="block text-sm font-medium text-navy">
                        Delivery Address
                      </label>

                      <Link
                        to="/my-addresses"
                        className="text-sm font-semibold text-[#80621C] hover:underline"
                      >
                        Manage Addresses
                      </Link>
                    </div>

                    {addressesLoading ? (
                      <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
                        Loading your saved addresses...
                      </p>
                    ) : (
                      <>
                        <select
                          value={selectedAddressId}
                          onChange={(event) =>
                            handleSavedAddressChange(event.target.value)
                          }
                          className="w-full rounded-lg border border-gray-300 bg-white p-3 text-sm outline-none focus:border-champagne"
                        >
                          {savedAddresses.map((address) => (
                            <option key={address.id} value={String(address.id)}>
                              {address.label} - {address.recipient_name}
                              {address.is_default ? " (Default)" : ""}
                            </option>
                          ))}

                          <option value="new">+ Use a new address</option>
                        </select>

                        {selectedAddressId !== "new" ? (
                          <div className="mt-3 rounded-lg border border-champagne bg-ivory p-4">
                            <p className="font-semibold text-navy">
                              {
                                savedAddresses.find(
                                  (address) =>
                                    String(address.id) === selectedAddressId
                                )?.recipient_name
                              }
                            </p>

                            <p className="mt-1 text-sm text-gray-600">
                              {deliveryAddress}
                            </p>

                            <p className="mt-2 text-sm text-gray-600">
                              Phone: {customerPhone}
                            </p>

                            <p className="mt-3 text-xs text-green-700">
                              ✓ Saved address selected
                            </p>
                          </div>
                        ) : (
                          <div className="mt-4 space-y-4">
                            {savedAddresses.length === 0 && (
                              <p className="text-sm text-gray-500">
                                You don't have a saved address yet. You can enter one below
                                or add it from{" "}
                                <Link
                                  to="/my-addresses"
                                  className="font-semibold text-[#80621C] underline"
                                >
                                  My Addresses
                                </Link>.
                              </p>
                            )}

                            <div>
                              <label className="mb-2 block text-sm font-medium text-navy">
                                Full Address
                              </label>

                              <textarea
                                value={deliveryAddress}
                                onChange={(event) =>
                                  setDeliveryAddress(event.target.value)
                                }
                                placeholder="Enter your complete address"
                                rows={3}
                                className="w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-champagne"
                              />
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-medium text-navy">
                                Phone Number
                              </label>

                              <input
                                type="tel"
                                value={customerPhone}
                                onChange={(event) =>
                                  setCustomerPhone(
                                    event.target.value.replace(/\D/g, "").slice(0, 10)
                                  )
                                }
                                placeholder="10-digit phone number"
                                maxLength={10}
                                className="w-full rounded-lg border border-gray-300 p-3 outline-none focus:border-champagne"
                              />
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {addressesError && (
                      <p className="mt-2 text-xs text-amber-700">
                        {addressesError}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Payment method */}
            <section className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold text-navy">
                2. Payment Method
              </h2>

              <div className="space-y-3">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-4">
                  <input
                    type="radio"
                    name="payment"
                    value="cash"
                    checked={paymentMethod === "cash"}
                    onChange={() => setPaymentMethod("cash")}
                  />

                  <span className="font-medium text-navy">
                    Cash{" "}
                    {deliveryType === "delivery"
                      ? "on Delivery"
                      : "on Pickup"}
                  </span>
                </label>

                <label className="flex cursor-not-allowed items-center gap-3 rounded-lg border border-gray-200 p-4 opacity-60">
                  <input
                    type="radio"
                    name="payment"
                    value="online"
                    checked={paymentMethod === "online"}
                    onChange={() => setPaymentMethod("online")}
                    disabled
                  />

                  <span className="font-medium text-navy">
                    Online Payment (Coming Soon)
                  </span>
                </label>
              </div>
            </section>

            {/* Notes and coupon */}
            <section className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold text-navy">
                3. Additional Details
              </h2>

              <label className="mb-2 block text-sm font-medium text-navy">
                Coupon Code (optional)
              </label>

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={couponCode}
                  onChange={(e) => {
                    setCouponCode(e.target.value);
                    setCoupon(null);
                    setCouponMessage("");
                    setCouponError("");
                  }}
                  placeholder="Enter coupon code"
                  className="min-w-0 flex-1 rounded-lg border border-gray-300 p-3"
                />

                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  disabled={couponLoading || !couponCode.trim()}
                  className="rounded-lg bg-navy px-5 py-3 font-semibold text-white hover:bg-navy-secondary disabled:opacity-50"
                >
                  {couponLoading ? "Checking..." : "Apply"}
                </button>
              </div>

              {couponMessage && (
                <p className="mt-2 text-sm text-green-700">
                  {couponMessage}
                </p>
              )}

              {couponError && (
                <p className="mt-2 text-sm text-red-600">
                  {couponError}
                </p>
              )}

              <label className="mb-2 mt-5 block text-sm font-medium text-navy">
                Order Notes (optional)
              </label>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Any special instructions?"
                className="w-full rounded-lg border border-gray-300 p-3"
              />
            </section>
          </div>

          {/* Order summary */}
          <aside className="h-fit rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-xl font-semibold text-navy">
              Order Summary
            </h2>

            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.product.id}
                  className="flex justify-between gap-4 border-b border-gray-100 pb-3"
                >
                  <div>
                    <p className="font-medium text-navy">
                      {item.product.name}
                    </p>

                    <p className="text-sm text-gray-500">
                      {item.purchase_mode === "amount"
                        ? `Amount purchase: ₹${Number(
                            item.purchase_amount || 0
                          ).toFixed(2)}`
                        : `Quantity: ${item.quantity} ${item.product.unit}`}
                    </p>
                  </div>

                  <span className="font-medium text-navy">
                    ₹
                    {(
                      item.purchase_mode === "amount"
                        ? item.purchase_amount || 0
                        : Number(item.product.discounted_price) *
                          item.quantity
                    ).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>

            <div className="mt-2 flex justify-between text-gray-600">
              <span>Delivery Fee</span>

              <span>
                {settingsLoading && deliveryType === "delivery"
                  ? "Loading..."
                  : settingsError && deliveryType === "delivery"
                    ? "Unavailable"
                    : `₹${deliveryFee.toFixed(2)}`}
              </span>
            </div>

            {coupon && (
              <div className="mt-2 flex justify-between text-green-700">
                <span>Coupon ({coupon.coupon_code})</span>
                <span>-₹{discountAmount.toFixed(2)}</span>
              </div>
            )}

            <div className="mt-4 flex justify-between border-t border-gray-200 pt-4 text-lg font-bold text-navy">
              <span>Estimated Total</span>
              <span>₹{estimatedTotal.toFixed(2)}</span>
            </div>

            <p className="mt-3 text-xs text-gray-500">
              {coupon
                ? "Coupon discount and total are based on the server's validation."
                : "The final order total is confirmed by the server when you place your order."}
            </p>

            {settingsError && deliveryType === "delivery" && (
              <p className="mt-3 text-xs text-red-600">
                {settingsError} The final fee will be calculated by the server.
              </p>
            )}

            {error && (
              <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handlePlaceOrder}
              disabled={placingOrder || paymentMethod === "online"}
              className="mt-6 w-full rounded-lg bg-navy px-5 py-3 font-semibold text-white transition hover:bg-navy-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {placingOrder ? "Placing Order..." : "Place Order"}
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default Checkout;
