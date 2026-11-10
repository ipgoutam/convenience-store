import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";

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
  created_at: string | null;
  items: OrderItem[];
}

interface OrderSummary {
  total_orders: number;
  pending_orders: number;
  confirmed_orders: number;
  preparing_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  total_revenue: number | string;
}

type StatusOption =
  | "confirmed"
  | "preparing"
  | "ready_for_pickup"
  | "out_for_delivery"
  | "completed"
  | "cancelled";

const PAGE_SIZE = 10;

const statusStyles: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  preparing: "bg-purple-100 text-purple-800",
  ready_for_pickup: "bg-indigo-100 text-indigo-800",
  out_for_delivery: "bg-cyan-100 text-cyan-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const paymentStyles: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  refunded: "bg-gray-100 text-gray-700",
};

const formatCurrency = (value: number | string | null | undefined) => {
  return `₹${Number(value || 0).toFixed(2)}`;
};

const formatStatus = (status: string) => {
  return status.replaceAll("_", " ").replace(/\b\w/g, (char) =>
    char.toUpperCase()
  );
};

const formatDate = (date: string | null) => {
  if (!date) return "—";

  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Identify delivery orders that still require COD collection.
const isCodPaymentDue = (order: Order) =>
  order.payment_method === "cash" &&
  order.delivery_type === "delivery" &&
  order.payment_status === "pending" &&
  ["out_for_delivery", "completed"].includes(order.order_status);

// Return only status changes permitted by the backend.
const getAvailableStatuses = (order: Order): StatusOption[] => {
  const current = order.order_status;

  if (current === "pending") {
    return order.payment_status === "paid"
      ? ["confirmed"]
      : ["confirmed", "cancelled"];
  }

  if (current === "confirmed") {
    return order.payment_status === "paid"
      ? ["preparing"]
      : ["preparing", "cancelled"];
  }

  if (current === "preparing") {
    return order.delivery_type === "pickup"
      ? order.payment_status === "paid"
        ? ["ready_for_pickup"]
        : ["ready_for_pickup", "cancelled"]
      : order.payment_status === "paid"
        ? ["out_for_delivery"]
        : ["out_for_delivery", "cancelled"];
  }

  if (current === "ready_for_pickup") {
    return order.payment_status === "paid"
      ? ["completed"]
      : ["completed", "cancelled"];
  }

  if (current === "out_for_delivery") {
    // COD delivery must be paid before it can be completed.
    if (isCodPaymentDue(order)) {
      return [];
    }

    return ["completed"];
  }

  return [];
};

function Orders() {
  const { user } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState<OrderSummary | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [deliveryType, setDeliveryType] = useState("");

  const [page, setPage] = useState(1);

  const [totalPages, setTotalPages] = useState(1);

  const isAdmin =
    user?.role === "admin" || user?.role === "super_admin";

  // Load order summary.
  const loadSummary = useCallback(async () => {
    try {
      const response = await api.get("/orders/admin/summary");
      setSummary(response.data);
    } catch (err) {
      console.error("Could not load order summary:", err);
    }
  }, []);

  // Load orders.
  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      if (search.trim()) {
        // Search endpoint returns up to 100 matching orders.
        const response = await api.get("/orders/admin/search", {
          params: {
            keyword: search.trim(),
          },
        });

        let results: Order[] = response.data;

        // Apply filters locally to search results.
        if (orderStatus) {
          results = results.filter(
            (order) => order.order_status === orderStatus
          );
        }

        if (paymentStatus) {
          results = results.filter(
            (order) => order.payment_status === paymentStatus
          );
        }

        if (deliveryType) {
          results = results.filter(
            (order) => order.delivery_type === deliveryType
          );
        }

        const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));

        setTotalPages(pages);

        const start = (page - 1) * PAGE_SIZE;

        setOrders(results.slice(start, start + PAGE_SIZE));
      } else {
        const response = await api.get("/orders/admin/all", {
          params: {
            skip: (page - 1) * PAGE_SIZE,
            limit: PAGE_SIZE,
            ...(orderStatus && { order_status: orderStatus }),
            ...(paymentStatus && { payment_status: paymentStatus }),
            ...(deliveryType && { delivery_type: deliveryType }),
          },
        });

        // Backend returns a list, not a paginated object.
        const results: Order[] = response.data;

        setOrders(results);

        // The backend currently does not return total count.
        // Disable further pages when fewer than PAGE_SIZE records arrive.
        setTotalPages(
          results.length === PAGE_SIZE ? page + 1 : page
        );
      }
    } catch (err: any) {
      console.error("Could not load orders:", err);

      setError(
        err.response?.data?.detail || "Could not load orders."
      );

      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [search, orderStatus, paymentStatus, deliveryType, page]);

  useEffect(() => {
    if (!isAdmin) return;

    loadSummary();
  }, [isAdmin, loadSummary]);

  useEffect(() => {
    if (!isAdmin) return;

    loadOrders();
  }, [isAdmin, loadOrders]);

  // Reset pagination when filters change.
  useEffect(() => {
    setPage(1);
  }, [search, orderStatus, paymentStatus, deliveryType]);

  // Open full order details.
  const viewOrder = async (orderId: number) => {
    setDetailsLoading(true);
    setSelectedOrder(null);
    setError("");

    try {
      const response = await api.get(`/orders/admin/${orderId}`);
      setSelectedOrder(response.data);
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Could not load order details."
      );
    } finally {
      setDetailsLoading(false);
    }
  };

  // Update order status.
  const updateOrderStatus = async (
    orderId: number,
    newStatus: StatusOption
  ) => {
    const confirmed = window.confirm(
      `Are you sure you want to change this order status to "${formatStatus(
        newStatus
      )}"?`
    );

    if (!confirmed) return;

    setUpdatingOrderId(orderId);
    setError("");
    setSuccess("");

    try {
      await api.patch(`/orders/${orderId}/status`, {
        order_status: newStatus,
      });

      setSuccess("Order status updated successfully.");

      await Promise.all([loadOrders(), loadSummary()]);

      // Refresh the details modal if this order is open.
      if (selectedOrder?.id === orderId) {
        const response = await api.get(`/orders/admin/${orderId}`);
        setSelectedOrder(response.data);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Could not update order status."
      );
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // Mark COD cash as collected.
  const markCodPaymentCollected = async (orderId: number) => {
    const order =
      selectedOrder?.id === orderId
        ? selectedOrder
        : orders.find((item) => item.id === orderId);

    if (!order || !isCodPaymentDue(order)) {
      setError("This order is not currently eligible for COD collection.");
      return;
    }

    const confirmed = window.confirm(
      `Confirm that you received ${formatCurrency(
        order.total_amount
      )} in cash for order ${order.order_number}?`
    );

    if (!confirmed) return;

    setUpdatingOrderId(orderId);
    setError("");
    setSuccess("");

    try {
      await api.patch(`/orders/${orderId}/collect-cod`);

      setSuccess(
        `Cash of ${formatCurrency(order.total_amount)} collected successfully.`
      );

      await Promise.all([loadOrders(), loadSummary()]);

      // Refresh the details modal if this order is open.
      if (selectedOrder?.id === orderId) {
        const response = await api.get(`/orders/admin/${orderId}`);
        setSelectedOrder(response.data);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          "Could not record COD payment collection."
      );
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const visibleSummary = useMemo(
    () => [
      {
        label: "Total Orders",
        value: summary?.total_orders ?? 0,
        icon: "📦",
        color: "bg-blue-50 text-blue-700",
      },
      {
        label: "Pending Orders",
        value: summary?.pending_orders ?? 0,
        icon: "⏳",
        color: "bg-yellow-50 text-yellow-700",
      },
      {
        label: "Confirmed Orders",
        value: summary?.confirmed_orders ?? 0,
        icon: "✓",
        color: "bg-indigo-50 text-indigo-700",
      },
      {
        label: "Preparing Orders",
        value: summary?.preparing_orders ?? 0,
        icon: "🛠️",
        color: "bg-purple-50 text-purple-700",
      },
      {
        label: "Completed Orders",
        value: summary?.completed_orders ?? 0,
        icon: "✅",
        color: "bg-green-50 text-green-700",
      },
      {
        label: "Cancelled Orders",
        value: summary?.cancelled_orders ?? 0,
        icon: "✕",
        color: "bg-red-50 text-red-700",
      },
    ],
    [summary]
  );

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-4xl rounded-xl bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-bold text-gray-800">
            Access denied
          </h2>
          <p className="mt-2 text-gray-500">
            You need an admin account to manage orders.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">

        {/* Page heading */}
        <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-[#B3944D]">
              G-MART ADMIN
            </p>

            <h1 className="mt-1 text-2xl font-bold text-[#101B2D] sm:text-3xl">
              Order Management
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              View, manage and track customer orders.
            </p>
          </div>

          <button
            onClick={() => {
              loadOrders();
              loadSummary();
            }}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            ↻ Refresh Orders
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button
              onClick={() => setError("")}
              className="ml-3 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {success && (
          <div className="mb-5 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <span>{success}</span>
            <button
              onClick={() => setSuccess("")}
              className="ml-3 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Summary cards */}
        <div className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {visibleSummary.map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">{item.label}</p>

                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg ${item.color}`}
                >
                  {item.icon}
                </span>
              </div>

              <p className="mt-3 text-2xl font-bold text-[#101B2D]">
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {/* Revenue card */}
        <div className="mb-7 rounded-xl bg-[#101B2D] p-6 text-white shadow-sm">
          <p className="text-sm text-gray-300">Total Revenue</p>
          <p className="mt-2 text-3xl font-bold">
            {formatCurrency(summary?.total_revenue)}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Revenue reported by the order summary API
          </p>
        </div>

        {/* Search and filters */}
        <div className="mb-6 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-[#101B2D]">
            Find Orders
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-600">
                Search Orders
              </label>

              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Order number, phone or customer ID"
                className="form-input"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-600">
                Order Status
              </label>

              <select
                value={orderStatus}
                onChange={(e) => setOrderStatus(e.target.value)}
                className="form-input"
              >
                <option value="">All Order Statuses</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="preparing">Preparing</option>
                <option value="ready_for_pickup">Ready for Pickup</option>
                <option value="out_for_delivery">Out for Delivery</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-600">
                Payment Status
              </label>

              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                className="form-input"
              >
                <option value="">All Payment Statuses</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="failed">Failed</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-600">
                Delivery Type
              </label>

              <select
                value={deliveryType}
                onChange={(e) => setDeliveryType(e.target.value)}
                className="form-input"
              >
                <option value="">All Delivery Types</option>
                <option value="pickup">Pickup</option>
                <option value="delivery">Delivery</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={() => {
                setSearch("");
                setOrderStatus("");
                setPaymentStatus("");
                setDeliveryType("");
                setPage(1);
              }}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Orders table */}
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-2 border-b border-gray-100 p-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-bold text-[#101B2D]">
                All Orders
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Manage customer orders and their progress.
              </p>
            </div>

            <span className="text-sm text-gray-500">
              Page {page}
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-500">
              Loading orders...
            </div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-4xl">📦</div>
              <h3 className="mt-3 font-semibold text-gray-700">
                No orders found
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Try changing your search or filters.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-5 py-4">Order</th>
                      <th className="px-5 py-4">Customer</th>
                      <th className="px-5 py-4">Date</th>
                      <th className="px-5 py-4">Type</th>
                      <th className="px-5 py-4">Amount</th>
                      <th className="px-5 py-4">Payment</th>
                      <th className="px-5 py-4">Order Status</th>
                      <th className="px-5 py-4">Action</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {orders.map((order) => {
                      const availableStatuses =
                        getAvailableStatuses(order);

                      const codDue = isCodPaymentDue(order);

                      return (
                        <tr
                          key={order.id}
                          className="transition hover:bg-gray-50"
                        >
                          <td className="px-5 py-4">
                            <p className="font-semibold text-[#101B2D]">
                              {order.order_number}
                            </p>
                            <p className="mt-1 text-xs text-gray-400">
                              ID: {order.id}
                            </p>
                          </td>

                          <td className="px-5 py-4">
                            <p className="font-medium text-gray-700">
                              Customer #{order.customer_id}
                            </p>
                            <p className="mt-1 text-xs text-gray-400">
                              {order.customer_phone || "No phone"}
                            </p>
                          </td>

                          <td className="px-5 py-4 text-gray-600">
                            {formatDate(order.created_at)}
                          </td>

                          <td className="px-5 py-4">
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold capitalize text-gray-700">
                              {order.delivery_type}
                            </span>
                          </td>

                          <td className="px-5 py-4 font-semibold text-[#101B2D]">
                            {formatCurrency(order.total_amount)}
                            {codDue && (
                              <p className="mt-1 text-xs font-semibold text-orange-700">
                                COD to collect
                              </p>
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex flex-col items-start gap-1">
                              <span className="text-xs font-medium capitalize text-gray-600">
                                {order.payment_method}
                              </span>

                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  paymentStyles[order.payment_status] ||
                                  "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {formatStatus(order.payment_status)}
                              </span>
                            </div>
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`inline-block rounded-full px-3 py-1.5 text-xs font-semibold ${
                                statusStyles[order.order_status] ||
                                "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {formatStatus(order.order_status)}
                            </span>
                          </td>

                          <td className="px-5 py-4">
                            <button
                              onClick={() => viewOrder(order.id)}
                              className="rounded-lg bg-[#101B2D] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#1C2B42]"
                            >
                              View Details
                            </button>

                            {codDue && (
                              <button
                                onClick={() =>
                                  markCodPaymentCollected(order.id)
                                }
                                disabled={updatingOrderId === order.id}
                                className="mt-2 block w-full rounded-lg bg-green-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {updatingOrderId === order.id
                                  ? "Recording..."
                                  : "Mark Cash Collected"}
                              </button>
                            )}

                            {availableStatuses.length > 0 && (
                              <select
                                disabled={updatingOrderId === order.id}
                                value=""
                                onChange={(e) => {
                                  if (e.target.value) {
                                    updateOrderStatus(
                                      order.id,
                                      e.target.value as StatusOption
                                    );
                                  }
                                }}
                                className="mt-2 block w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs outline-none focus:border-[#D6B875]"
                              >
                                <option value="">
                                  {updatingOrderId === order.id
                                    ? "Updating..."
                                    : "Update Status"}
                                </option>

                                {availableStatuses.map((status) => (
                                  <option key={status} value={status}>
                                    {formatStatus(status)}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4">
                <p className="text-sm text-gray-500">
                  Page {page} of {totalPages}
                </p>

                <div className="flex gap-2">
                  <button
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((current) => current - 1)}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>

                  <button
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((current) => current + 1)}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Order details modal */}
      {(selectedOrder || detailsLoading) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6"
          onClick={() => {
            if (!detailsLoading) setSelectedOrder(null);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {detailsLoading ? (
              <div className="p-12 text-center text-gray-500">
                Loading order details...
              </div>
            ) : selectedOrder ? (
              <>
                {/* Modal header */}
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white p-5 sm:p-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#B3944D]">
                      ORDER DETAILS
                    </p>

                    <h2 className="mt-1 text-xl font-bold text-[#101B2D]">
                      {selectedOrder.order_number}
                    </h2>

                    <p className="mt-1 text-xs text-gray-500">
                      {formatDate(selectedOrder.created_at)}
                    </p>
                  </div>

                  <button
                    onClick={() => setSelectedOrder(null)}
                    className="rounded-lg bg-gray-100 px-3 py-2 text-gray-600 transition hover:bg-gray-200"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-6 p-5 sm:p-6">
                  {/* Status and customer */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-xl bg-gray-50 p-4">
                      <p className="text-xs font-medium uppercase text-gray-500">
                        Customer
                      </p>

                      <p className="mt-2 font-semibold text-[#101B2D]">
                        Customer #{selectedOrder.customer_id}
                      </p>

                      <p className="mt-1 text-sm text-gray-600">
                        {selectedOrder.customer_phone || "No phone number"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-gray-50 p-4">
                      <p className="text-xs font-medium uppercase text-gray-500">
                        Delivery Information
                      </p>

                      <p className="mt-2 font-semibold capitalize text-[#101B2D]">
                        {selectedOrder.delivery_type}
                      </p>

                      <p className="mt-1 text-sm text-gray-600">
                        {selectedOrder.delivery_address ||
                          "Store pickup"}
                      </p>
                    </div>
                  </div>

                  {/* Order and payment status */}
                  <div>
                    <h3 className="mb-3 font-bold text-[#101B2D]">
                      Order Status
                    </h3>

                    <div className="flex flex-wrap gap-3">
                      <span
                        className={`rounded-full px-3 py-2 text-xs font-semibold ${
                          statusStyles[selectedOrder.order_status] ||
                          "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {formatStatus(selectedOrder.order_status)}
                      </span>

                      <span
                        className={`rounded-full px-3 py-2 text-xs font-semibold ${
                          paymentStyles[selectedOrder.payment_status] ||
                          "bg-gray-100 text-gray-700"
                        }`}
                      >
                        Payment: {formatStatus(selectedOrder.payment_status)}
                      </span>

                      <span className="rounded-full bg-gray-100 px-3 py-2 text-xs font-semibold capitalize text-gray-700">
                        Method: {selectedOrder.payment_method}
                      </span>
                    </div>
                  </div>

                  {/* COD collection */}
                  {isCodPaymentDue(selectedOrder) && (
                    <div className="rounded-xl border border-orange-200 bg-orange-50 p-5">
                      <p className="text-sm font-semibold uppercase tracking-wide text-orange-800">
                        Cash on Delivery
                      </p>

                      <p className="mt-2 text-sm text-orange-700">
                        Collect this amount from the customer before completing the delivery.
                      </p>

                      <p className="mt-3 text-3xl font-bold text-[#101B2D]">
                        {formatCurrency(selectedOrder.total_amount)}
                      </p>

                      <button
                        onClick={() =>
                          markCodPaymentCollected(selectedOrder.id)
                        }
                        disabled={updatingOrderId === selectedOrder.id}
                        className="mt-4 w-full rounded-lg bg-green-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                      >
                        {updatingOrderId === selectedOrder.id
                          ? "Recording Payment..."
                          : "✓ Mark Cash as Collected"}
                      </button>
                    </div>
                  )}

                  {/* Products */}
                  <div>
                    <h3 className="mb-3 font-bold text-[#101B2D]">
                      Ordered Products
                    </h3>

                    <div className="overflow-x-auto rounded-xl border border-gray-100">
                      <table className="w-full min-w-[550px] text-left text-sm">
                        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                          <tr>
                            <th className="px-4 py-3">Product</th>
                            <th className="px-4 py-3">Quantity</th>
                            <th className="px-4 py-3">Unit Price</th>
                            <th className="px-4 py-3">Total</th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100">
                          {selectedOrder.items?.map((item) => (
                            <tr key={item.id}>
                              <td className="px-4 py-3">
                                <p className="font-semibold text-gray-800">
                                  {item.product_name}
                                </p>

                                <p className="mt-1 text-xs text-gray-400">
                                  {item.purchase_mode === "amount"
                                    ? `Amount purchase: ${formatCurrency(
                                        item.purchase_amount
                                      )}`
                                    : `Quantity purchase`}
                                </p>
                              </td>

                              <td className="px-4 py-3 text-gray-600">
                                {Number(item.quantity)} {item.unit}
                              </td>

                              <td className="px-4 py-3 text-gray-600">
                                {formatCurrency(item.unit_price)}
                              </td>

                              <td className="px-4 py-3 font-semibold text-[#101B2D]">
                                {formatCurrency(item.line_total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <p className="mt-2 text-xs text-gray-400">
                      Stock deducted:{" "}
                      {selectedOrder.items?.reduce(
                        (total, item) =>
                          total + Number(item.stock_deduction_quantity || 0),
                        0
                      )}{" "}
                      units in total. This is separate from the customer's
                      purchased quantity.
                    </p>
                  </div>

                  {/* Price breakdown */}
                  <div className="rounded-xl bg-gray-50 p-5">
                    <h3 className="mb-4 font-bold text-[#101B2D]">
                      Price Summary
                    </h3>

                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between text-gray-600">
                        <span>Subtotal</span>
                        <span>{formatCurrency(selectedOrder.subtotal)}</span>
                      </div>

                      <div className="flex justify-between text-gray-600">
                        <span>Delivery Fee</span>
                        <span>
                          {formatCurrency(selectedOrder.delivery_fee)}
                        </span>
                      </div>

                      {selectedOrder.coupon_code && (
                        <div className="flex justify-between text-gray-600">
                          <span>
                            Coupon ({selectedOrder.coupon_code})
                          </span>
                          <span className="text-green-700">
                            -{formatCurrency(selectedOrder.discount_amount)}
                          </span>
                        </div>
                      )}

                      <div className="border-t border-gray-200 pt-3">
                        <div className="flex justify-between text-lg font-bold text-[#101B2D]">
                          <span>Total Amount</span>
                          <span>
                            {formatCurrency(selectedOrder.total_amount)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  {selectedOrder.notes && (
                    <div className="rounded-xl border border-gray-100 p-4">
                      <h3 className="font-bold text-[#101B2D]">
                        Customer Notes
                      </h3>

                      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
                        {selectedOrder.notes}
                      </p>
                    </div>
                  )}

                  {/* Status update inside modal */}
                  {getAvailableStatuses(selectedOrder).length > 0 && (
                    <div className="rounded-xl border border-gray-100 p-4">
                      <h3 className="mb-3 font-bold text-[#101B2D]">
                        Update Order Status
                      </h3>

                      <div className="flex flex-wrap gap-2">
                        {getAvailableStatuses(selectedOrder).map((status) => (
                          <button
                            key={status}
                            disabled={updatingOrderId === selectedOrder.id}
                            onClick={() =>
                              updateOrderStatus(selectedOrder.id, status)
                            }
                            className="rounded-lg bg-[#101B2D] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1C2B42] disabled:opacity-50"
                          >
                            {updatingOrderId === selectedOrder.id
                              ? "Updating..."
                              : formatStatus(status)}
                          </button>
                        ))}
                      </div>

                      {isCodPaymentDue(selectedOrder) && (
                        <p className="mt-3 text-xs text-orange-700">
                          Complete delivery will become available after COD payment is collected.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default Orders;