
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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

interface Order {
  id: number;
  order_number: string;
  customer_id: number;
  delivery_type: "pickup" | "delivery";
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
  created_at: string;
  items: OrderItem[];
}

interface OrderSummary {
  total_orders: number;
  pending_orders: number;
  active_orders: number;
  completed_orders: number;
  cancelled_orders: number;
}

const PAGE_SIZE = 10;

const formatPrice = (value: number | string | null | undefined) => {
  return `₹${Number(value ?? 0).toFixed(2)}`;
};

const formatDate = (value: string) => {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatStatus = (status: string) => {
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) =>
    letter.toUpperCase()
  );
};

const getOrderStatusStyle = (status: string) => {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-700";
    case "cancelled":
      return "bg-red-100 text-red-700";
    case "pending":
      return "bg-yellow-100 text-yellow-700";
    case "confirmed":
      return "bg-blue-100 text-blue-700";
    case "preparing":
      return "bg-purple-100 text-purple-700";
    case "ready_for_pickup":
      return "bg-indigo-100 text-indigo-700";
    case "out_for_delivery":
      return "bg-orange-100 text-orange-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

const getPaymentStatusStyle = (status: string) => {
  switch (status) {
    case "paid":
      return "bg-green-100 text-green-700";
    case "failed":
      return "bg-red-100 text-red-700";
    case "refunded":
      return "bg-purple-100 text-purple-700";
    default:
      return "bg-yellow-100 text-yellow-700";
  }
};

function MyOrders() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState<OrderSummary | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [ordersResult, summaryResult] = await Promise.allSettled([
        api.get<Order[]>("/orders/my-orders", {
          params: { skip: 0, limit: 100 },
        }),
        api.get<OrderSummary>("/orders/my-orders/summary"),
      ]);

      if (ordersResult.status === "fulfilled") {
        setOrders(ordersResult.value.data);
      } else {
        throw ordersResult.reason;
      }

      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value.data);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          "Could not load your orders. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch = order.order_number
        .toLowerCase()
        .includes(search.trim().toLowerCase());

      const matchesStatus =
        statusFilter === "all" || order.order_status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredOrders.length / PAGE_SIZE)
  );

  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  const openOrderDetails = useCallback(async (orderId: number) => {
    setDetailsLoading(true);
    setSelectedOrder(null);

    try {
      const response = await api.get<Order>(`/orders/${orderId}`);
      setSelectedOrder(response.data);
    } catch (err: any) {
      alert(
        err.response?.data?.detail ||
          "Could not load order details."
      );
    } finally {
      setDetailsLoading(false);
    }
  }, []);
  const closeOrderDetails = () => {
    setSelectedOrder(null);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("orderId");

    setSearchParams(nextParams, { replace: true });
  };

  // Automatically open a specific order from a notification
  useEffect(() => {
    if (loading) return;

    const orderIdParam = searchParams.get("orderId");

    console.log("MyOrders effect running");
    console.log("Order ID from URL:", orderIdParam);

    if (!orderIdParam) {
      setSelectedOrder(null);
      setDetailsLoading(false);
      return;
    }

    const orderId = Number(orderIdParam);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      console.error("Invalid order ID:", orderIdParam);
      setSearchParams({}, { replace: true });
      return;
    }

    // Open the existing order details modal
    openOrderDetails(orderId);

  }, [loading, searchParams, setSearchParams, openOrderDetails]);

  const cancelOrder = async (order: Order) => {
    const confirmed = window.confirm(
      `Are you sure you want to cancel order ${order.order_number}?`
    );

    if (!confirmed) return;

    setCancellingId(order.id);

    try {
      const response = await api.patch<Order>(
        `/orders/${order.id}/cancel`
      );

      setOrders((previous) =>
        previous.map((item) =>
          item.id === order.id ? response.data : item
        )
      );

      if (selectedOrder?.id === order.id) {
        setSelectedOrder(response.data);
      }

      const summaryResponse = await api.get<OrderSummary>(
        "/orders/my-orders/summary"
      );
      setSummary(summaryResponse.data);

      alert("Your order has been cancelled successfully.");
    } catch (err: any) {
      alert(
        err.response?.data?.detail ||
          "Could not cancel your order. Please try again."
      );
    } finally {
      setCancellingId(null);
    }
  };

  const canCancel = (order: Order) => {
    return (
      order.order_status === "pending" &&
      order.payment_status !== "paid"
    );
  };

  return (
    <div className="min-h-screen bg-[#F7F5EF]">
      {/* Header */}
      <header className="bg-[#101B2D] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <div>
            <button
              onClick={() => navigate("/")}
              className="text-2xl font-bold tracking-wider text-[#D6B875]"
            >
              G-MART
            </button>
            <p className="mt-1 text-sm text-gray-300">
              Your orders and purchase history
            </p>
          </div>

          <button
            onClick={() => navigate("/")}
            className="rounded-lg border border-[#D6B875] px-4 py-2 text-sm font-semibold text-[#D6B875] transition hover:bg-[#D6B875] hover:text-[#101B2D]"
          >
            Continue Shopping
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page heading */}
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#101B2D]">
              My Orders
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Track your orders and view your purchase history.
            </p>
          </div>

          <button
            onClick={loadOrders}
            disabled={loading}
            className="rounded-lg bg-[#1C2B42] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#101B2D] disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh Orders"}
          </button>
        </div>

        {/* Summary cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            {
              label: "Total Orders",
              value: summary?.total_orders ?? 0,
              color: "border-[#D6B875]",
            },
            {
              label: "Pending",
              value: summary?.pending_orders ?? 0,
              color: "border-yellow-400",
            },
            {
              label: "Active",
              value: summary?.active_orders ?? 0,
              color: "border-blue-400",
            },
            {
              label: "Completed",
              value: summary?.completed_orders ?? 0,
              color: "border-green-400",
            },
            {
              label: "Cancelled",
              value: summary?.cancelled_orders ?? 0,
              color: "border-red-400",
            },
          ].map((card) => (
            <div
              key={card.label}
              className={`rounded-xl border-l-4 ${card.color} bg-white p-5 shadow-sm`}
            >
              <p className="text-sm text-gray-500">{card.label}</p>
              <p className="mt-2 text-3xl font-bold text-[#101B2D]">
                {card.value}
              </p>
            </div>
          ))}
        </div>

        {/* Search and filters */}
        <div className="mb-6 rounded-xl bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Search Order
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Enter order number..."
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-[#D6B875]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Filter by Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 outline-none focus:border-[#D6B875]"
              >
                <option value="all">All Orders</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="preparing">Preparing</option>
                <option value="ready_for_pickup">Ready for Pickup</option>
                <option value="out_for_delivery">Out for Delivery</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
            <button
              onClick={loadOrders}
              className="ml-3 font-bold underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Orders */}
        {loading ? (
          <div className="rounded-xl bg-white py-16 text-center shadow-sm">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-[#D6B875]" />
            <p className="mt-4 text-gray-500">Loading your orders...</p>
          </div>
        ) : paginatedOrders.length === 0 ? (
          <div className="rounded-xl bg-white px-6 py-16 text-center shadow-sm">
            <div className="mb-4 text-5xl">🛍️</div>
            <h2 className="text-xl font-bold text-[#101B2D]">
              {orders.length === 0
                ? "You haven't placed any orders yet"
                : "No matching orders found"}
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              {orders.length === 0
                ? "Explore G-MART and place your first order."
                : "Try changing your search or status filter."}
            </p>
            {orders.length === 0 && (
              <button
                onClick={() => navigate("/")}
                className="mt-6 rounded-lg bg-[#101B2D] px-6 py-3 font-semibold text-white hover:bg-[#1C2B42]"
              >
                Start Shopping
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-5">
              {paginatedOrders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-xl bg-white p-5 shadow-sm transition hover:shadow-md sm:p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Order Number
                      </p>
                      <h3 className="mt-1 break-all font-bold text-[#101B2D]">
                        {order.order_number}
                      </h3>
                      <p className="mt-2 text-sm text-gray-500">
                        {formatDate(order.created_at)}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${getOrderStatusStyle(
                        order.order_status
                      )}`}
                    >
                      {formatStatus(order.order_status)}
                    </span>
                  </div>

                  <div className="my-5 grid grid-cols-2 gap-4 border-y border-gray-100 py-4 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-gray-500">Order Total</p>
                      <p className="mt-1 font-bold text-[#101B2D]">
                        {formatPrice(order.total_amount)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500">Items</p>
                      <p className="mt-1 font-semibold text-gray-800">
                        {order.items?.length ?? 0}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500">Order Type</p>
                      <p className="mt-1 font-semibold capitalize text-gray-800">
                        {order.delivery_type}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500">Payment</p>
                      <p className="mt-1 font-semibold capitalize text-gray-800">
                        {order.payment_method}
                      </p>
                      <span
                        className={`mt-1 inline-block rounded-full px-2 py-1 text-xs font-semibold ${getPaymentStatusStyle(
                          order.payment_status
                        )}`}
                      >
                        {formatStatus(order.payment_status)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-3">
                    {canCancel(order) && (
                      <button
                        onClick={() => cancelOrder(order)}
                        disabled={cancellingId === order.id}
                        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        {cancellingId === order.id
                          ? "Cancelling..."
                          : "Cancel Order"}
                      </button>
                    )}

                    <button
                      onClick={() => {
                        const nextParams = new URLSearchParams(searchParams);
                        nextParams.set("orderId", String(order.id));
                        setSearchParams(nextParams);
                      }}
                      className="rounded-lg bg-[#101B2D] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1C2B42]"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-7 flex items-center justify-center gap-4">
                <button
                  onClick={() =>
                    setCurrentPage((page) => Math.max(1, page - 1))
                  }
                  disabled={currentPage === 1}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>

                <span className="text-sm font-medium text-gray-600">
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  onClick={() =>
                    setCurrentPage((page) =>
                      Math.min(totalPages, page + 1)
                    )
                  }
                  disabled={currentPage === totalPages}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}

            <p className="mt-4 text-center text-xs text-gray-500">
              Showing {paginatedOrders.length} of {filteredOrders.length} orders
              {orders.length === 100 ? " (latest 100 loaded)" : ""}
            </p>
          </>
        )}
      </main>

      {/* Order details modal */}
      {(selectedOrder || detailsLoading) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => {
            if (!detailsLoading) closeOrderDetails();
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            {detailsLoading ? (
              <div className="py-16 text-center">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-[#D6B875]" />
                <p className="mt-4 text-gray-500">
                  Loading order details...
                </p>
              </div>
            ) : selectedOrder ? (
              <>
                <div className="flex items-start justify-between gap-4 border-b border-gray-200 pb-4">
                  <div>
                    <h2 className="text-xl font-bold text-[#101B2D]">
                      Order Details
                    </h2>
                    <p className="mt-1 break-all text-sm text-gray-500">
                      {selectedOrder.order_number}
                    </p>
                  </div>

                  <button
                    onClick={closeOrderDetails}
                    className="rounded-lg px-3 py-1 text-2xl text-gray-500 hover:bg-gray-100"
                    aria-label="Close order details"
                  >
                    ×
                  </button>
                </div>

                {/* Status and date */}
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-gray-500">Order Status</p>
                    <span
                      className={`mt-2 inline-block rounded-full px-3 py-1.5 text-xs font-semibold ${getOrderStatusStyle(
                        selectedOrder.order_status
                      )}`}
                    >
                      {formatStatus(selectedOrder.order_status)}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500">Order Date</p>
                    <p className="mt-2 text-sm font-semibold text-gray-800">
                      {formatDate(selectedOrder.created_at)}
                    </p>
                  </div>
                </div>

                {/* Items */}
                <div className="mt-7">
                  <h3 className="mb-3 font-bold text-[#101B2D]">
                    Purchased Items
                  </h3>

                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full min-w-[520px] text-left text-sm">
                      <thead className="bg-[#101B2D] text-white">
                        <tr>
                          <th className="px-4 py-3">Product</th>
                          <th className="px-4 py-3">Quantity</th>
                          <th className="px-4 py-3">Unit Price</th>
                          <th className="px-4 py-3 text-right">Total</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-gray-100">
                        {selectedOrder.items?.map((item) => (
                          <tr key={item.id}>
                            <td className="px-4 py-3 font-medium text-gray-800">
                              {item.product_id ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigate(`/products/${item.product_id}`);
                                  }}
                                  className="text-left font-semibold text-[#8A6D25] transition hover:text-[#101B2D] hover:underline"
                                >
                                  {item.product_name}
                                </button>
                              ) : (
                                <span>{item.product_name}</span>
                              )}

                              {item.purchase_mode === "amount" && (
                                <p className="mt-1 text-xs text-gray-500">
                                  Amount-based purchase
                                </p>
                              )}
                            </td>

                            <td className="px-4 py-3 text-gray-600">
                              {Number(item.quantity).toLocaleString("en-IN", {
                                maximumFractionDigits: 12,
                              })}{" "}
                              {item.unit}
                            </td>

                            <td className="px-4 py-3 text-gray-600">
                              {formatPrice(item.unit_price)}
                            </td>

                            <td className="px-4 py-3 text-right font-semibold text-gray-800">
                              {formatPrice(item.line_total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Order amount */}
                <div className="mt-6 space-y-3 rounded-lg bg-gray-50 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-medium">
                      {formatPrice(selectedOrder.subtotal)}
                    </span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Delivery Fee</span>
                    <span className="font-medium">
                      {formatPrice(selectedOrder.delivery_fee)}
                    </span>
                  </div>

                  {Number(selectedOrder.discount_amount) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        Discount{" "}
                        {selectedOrder.coupon_code
                          ? `(${selectedOrder.coupon_code})`
                          : ""}
                      </span>
                      <span className="font-medium text-green-700">
                        -{formatPrice(selectedOrder.discount_amount)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between border-t border-gray-200 pt-3 text-lg font-bold text-[#101B2D]">
                    <span>Grand Total</span>
                    <span>{formatPrice(selectedOrder.total_amount)}</span>
                  </div>
                </div>

                {/* Delivery and payment information */}
                <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <h3 className="mb-2 font-bold text-[#101B2D]">
                      Delivery Information
                    </h3>
                    <p className="text-sm text-gray-600">
                      Type:{" "}
                      <span className="font-semibold capitalize">
                        {selectedOrder.delivery_type}
                      </span>
                    </p>

                    {selectedOrder.delivery_address && (
                      <p className="mt-2 text-sm text-gray-600">
                        Address: {selectedOrder.delivery_address}
                      </p>
                    )}

                    {selectedOrder.customer_phone && (
                      <p className="mt-2 text-sm text-gray-600">
                        Phone: {selectedOrder.customer_phone}
                      </p>
                    )}
                  </div>

                  <div>
                    <h3 className="mb-2 font-bold text-[#101B2D]">
                      Payment Information
                    </h3>
                    <p className="text-sm text-gray-600">
                      Method:{" "}
                      <span className="font-semibold capitalize">
                        {selectedOrder.payment_method}
                      </span>
                    </p>

                    <p className="mt-2 text-sm text-gray-600">
                      Status:{" "}
                      <span className="font-semibold capitalize">
                        {formatStatus(selectedOrder.payment_status)}
                      </span>
                    </p>
                  </div>
                </div>

                {selectedOrder.notes && (
                  <div className="mt-5">
                    <h3 className="mb-2 font-bold text-[#101B2D]">
                      Order Notes
                    </h3>
                    <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                      {selectedOrder.notes}
                    </p>
                  </div>
                )}

                {canCancel(selectedOrder) && (
                  <button
                    onClick={() => cancelOrder(selectedOrder)}
                    disabled={cancellingId === selectedOrder.id}
                    className="mt-6 w-full rounded-lg border border-red-300 px-4 py-3 font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    {cancellingId === selectedOrder.id
                      ? "Cancelling..."
                      : "Cancel This Order"}
                  </button>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default MyOrders;
