
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import api from "../../services/api";

interface OrderItem {
  id: number;
  product_id: number | null;
  product_name: string;
  unit: string;
  unit_price: number | string;
  quantity: number | string;
  stock_deduction_quantity: number;
  purchase_mode: "quantity" | "amount";
  purchase_amount: number | string | null;
  line_total: number | string;
}

interface OrderResponse {
  id: number;
  order_number: string;
  customer_id: number;
  delivery_type: string;
  delivery_address: string | null;
  customer_phone: string | null;
  notes: string | null;
  subtotal: number | string;
  delivery_fee: number | string;
  coupon_code: string | null;
  discount_amount: number | string;
  total_amount: number | string;
  payment_method: string;
  payment_status: string;
  order_status: string;
  created_at: string | null;
  items: OrderItem[];
}

function formatPrice(value: number | string | null | undefined) {
  return `₹${Number(value ?? 0).toFixed(2)}`;
}

function formatStatus(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) =>
    char.toUpperCase()
  );
}

function OrderSuccess() {
  const { orderId } = useParams<{ orderId: string }>();

  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const fetchOrder = async () => {
      if (!orderId || !/^\d+$/.test(orderId)) {
        setError("Invalid order ID.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const response = await api.get<OrderResponse>(
          `/orders/${orderId}`
        );

        if (!cancelled) {
          setOrder(response.data);
        }
      } catch (err: unknown) {
        const apiError = err as {
          response?: {
            data?: {
              detail?: string;
            };
          };
        };

        if (!cancelled) {
          setError(
            apiError.response?.data?.detail ||
              "Unable to load your order details."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchOrder();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ivory">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-navy" />
          <p className="mt-4 text-gray-600">
            Loading your order...
          </p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ivory px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-navy">
            Unable to load order
          </h1>

          <p className="mt-3 text-sm text-red-600">
            {error || "Order not found."}
          </p>

          <Link
            to="/my-orders"
            className="mt-6 inline-block rounded-lg bg-navy px-6 py-3 font-semibold text-white"
          >
            View My Orders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ivory px-4 py-8">
      <div className="mx-auto max-w-3xl">

        {/* Success Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-10 w-10 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          <h1 className="mt-5 text-3xl font-bold text-navy">
            Order Placed Successfully!
          </h1>

          <p className="mt-2 text-gray-600">
            Thank you for shopping with G-MART.
            Your order has been received.
          </p>
        </div>

        {/* Order Number */}
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-500">
                Order Number
              </p>

              <h2 className="mt-1 break-all text-xl font-bold text-navy">
                {order.order_number}
              </h2>
            </div>

            <span className="w-fit rounded-full bg-yellow-100 px-4 py-2 text-sm font-semibold text-yellow-800">
              {formatStatus(order.order_status)}
            </span>
          </div>

          {order.created_at && (
            <p className="mt-3 text-sm text-gray-500">
              Placed on{" "}
              {new Date(order.created_at).toLocaleString("en-IN")}
            </p>
          )}
        </section>

        {/* Items */}
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-bold text-navy">
            Order Items
          </h2>

          <div className="space-y-4">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex justify-between gap-4 border-b border-gray-100 pb-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-navy">
                    {item.product_name}
                  </p>

                  {item.purchase_mode === "amount" ? (
                    <>
                      <p className="mt-1 text-sm text-gray-500">
                        Amount purchase:{" "}
                        {formatPrice(item.purchase_amount)}
                      </p>

                      <p className="text-xs text-gray-400">
                        Approx. quantity: {Number(item.quantity)}{" "}
                        {item.unit}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-gray-500">
                      Quantity: {Number(item.quantity)} {item.unit}
                    </p>
                  )}
                </div>

                <p className="shrink-0 font-semibold text-navy">
                  {formatPrice(item.line_total)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Delivery Details */}
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-bold text-navy">
            Delivery Details
          </h2>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">
                Delivery Method
              </span>

              <span className="font-medium text-navy">
                {order.delivery_type === "pickup"
                  ? "Store Pickup"
                  : "Home Delivery"}
              </span>
            </div>

            {order.delivery_address && (
              <div>
                <p className="text-gray-500">
                  Delivery Address
                </p>

                <p className="mt-1 font-medium text-navy">
                  {order.delivery_address}
                </p>
              </div>
            )}

            {order.customer_phone && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">
                  Phone Number
                </span>

                <span className="font-medium text-navy">
                  {order.customer_phone}
                </span>
              </div>
            )}

            {order.notes && (
              <div>
                <p className="text-gray-500">Order Notes</p>
                <p className="mt-1 text-navy">{order.notes}</p>
              </div>
            )}
          </div>
        </section>

        {/* Payment and Summary */}
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-bold text-navy">
            Payment Summary
          </h2>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">
                Payment Method
              </span>

              <span className="font-medium text-navy">
                {order.payment_method === "cash"
                  ? "Cash"
                  : "Online Payment"}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-gray-500">
                Payment Status
              </span>

              <span className="font-medium text-yellow-700">
                {formatStatus(order.payment_status)}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span>{formatPrice(order.subtotal)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">Delivery Fee</span>
              <span>{formatPrice(order.delivery_fee)}</span>
            </div>

            {order.coupon_code && (
              <div className="flex justify-between gap-4 text-green-700">
                <span>Coupon ({order.coupon_code})</span>
                <span>
                  -{formatPrice(order.discount_amount)}
                </span>
              </div>
            )}

            <div className="flex justify-between border-t border-gray-200 pt-4 text-lg font-bold text-navy">
              <span>Total Paid / Due</span>
              <span>{formatPrice(order.total_amount)}</span>
            </div>
          </div>
        </section>

        {/* Actions */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link
            to="/my-orders"
            className="rounded-lg bg-navy px-6 py-3 text-center font-semibold text-white transition hover:bg-navy-secondary"
          >
            View My Orders
          </Link>

          <Link
            to="/"
            className="rounded-lg border border-navy px-6 py-3 text-center font-semibold text-navy transition hover:bg-white"
          >
            Continue Shopping
          </Link>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          Thank you for choosing G-MART!
        </p>
      </div>
    </div>
  );
}

export default OrderSuccess;
