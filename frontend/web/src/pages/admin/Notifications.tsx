
import { useCallback, useEffect, useState } from "react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";

interface AdminNotification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  notification_type: string;
  order_id: number | null;
  is_read: boolean;
  created_at: string;
  customer_name: string;
  customer_email: string;
}

interface NotificationDelivery {
  id: number;
  notification_id: number;
  user_id: number;
  customer_name: string;
  customer_email: string;
  notification_title: string;
  channel: string;
  recipient: string;
  status: string;
  attempts: number;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DeliveryStats {
  total_deliveries: number;
  sent: number;
  failed: number;
  pending: number;
}

interface NotificationStats {
  total_notifications: number;
  unread_notifications: number;
  read_notifications: number;
}

const Notifications = () => {
  const { user } = useAuth();

  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [stats, setStats] = useState<NotificationStats>({
    total_notifications: 0,
    unread_notifications: 0,
    read_notifications: 0,
  });

  const [deliveries, setDeliveries] = useState<NotificationDelivery[]>([]);
  const [deliveryStats, setDeliveryStats] = useState<DeliveryStats>({
    total_deliveries: 0,
    sent: 0,
    failed: 0,
    pending: 0,
  });

  const [deliveryChannel, setDeliveryChannel] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState("");
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AdminNotification | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const pageSize = 20;

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const params: Record<string, string | number | boolean> = {
        skip: page * pageSize,
        limit: pageSize,
      };

      if (search.trim()) params.search = search.trim();
      if (typeFilter) params.notification_type = typeFilter;

      if (statusFilter !== "") {
        params.is_read = statusFilter === "read";
      }

      const [notificationResponse, statsResponse] = await Promise.all([
        api.get("/admin/notifications/", { params }),
        api.get("/admin/notifications/stats"),
      ]);

      setNotifications(notificationResponse.data);
      setStats(statsResponse.data);
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          "Unable to load notifications. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [page, search, typeFilter, statusFilter]);

  const loadDeliveries = useCallback(async () => {
    try {
      setDeliveryLoading(true);
      setDeliveryError("");

      const params: Record<string, string | number> = {
        skip: 0,
        limit: 100,
      };

      if (deliveryChannel) params.channel = deliveryChannel;
      if (deliveryStatus) params.status = deliveryStatus;

      const [deliveryResponse, statsResponse] = await Promise.all([
        api.get("/admin/notification-deliveries/", { params }),
        api.get("/admin/notification-deliveries/stats"),
      ]);

      setDeliveries(deliveryResponse.data);
      setDeliveryStats(statsResponse.data);
    } catch (err: any) {
      setDeliveryError(
        err.response?.data?.detail ||
          "Unable to load delivery history."
      );
    } finally {
      setDeliveryLoading(false);
    }
  }, [deliveryChannel, deliveryStatus]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadNotifications();
    }, 300);

    return () => clearTimeout(timer);
  }, [loadNotifications]);

  useEffect(() => {
    loadDeliveries();
  }, [loadDeliveries]);

  const refreshAll = () => {
    loadNotifications();
    loadDeliveries();
  };

  const markAsRead = async (id: number) => {
    try {
      await api.patch(`/admin/notifications/${id}/read`);

      setNotifications((previous) =>
        previous.map((item) =>
          item.id === id ? { ...item, is_read: true } : item
        )
      );

      setSelected((previous) =>
        previous?.id === id ? { ...previous, is_read: true } : previous
      );

      setStats((previous) => ({
        ...previous,
        unread_notifications: Math.max(
          0,
          previous.unread_notifications - 1
        ),
        read_notifications: previous.read_notifications + 1,
      }));
    } catch (err: any) {
      alert(err.response?.data?.detail || "Could not mark as read.");
    }
  };

  const deleteNotification = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this notification?")) {
      return;
    }

    try {
      await api.delete(`/admin/notifications/${id}`);

      setSelected(null);
      await loadNotifications();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Could not delete notification.");
    }
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const typeLabel = (type: string) =>
    type.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const role = String(user?.role || "").toLowerCase();

  if (role !== "admin" && role !== "super_admin") {
    return (
      <div className="p-8 text-center text-red-600">
        You do not have permission to access this page.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F6F8] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-[#101B2D] sm:text-3xl">
              Notifications
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Monitor and manage customer notifications.
            </p>
          </div>

          <button
            onClick={refreshAll}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#101B2D] shadow-sm hover:bg-gray-50"
          >
            ↻ Refresh
          </button>
        </div>

        {/* Notification Statistics */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            title="Total Notifications"
            value={stats.total_notifications}
            icon="▤"
          />
          <StatCard
            title="Unread Notifications"
            value={stats.unread_notifications}
            icon="●"
          />
          <StatCard
            title="Read Notifications"
            value={stats.read_notifications}
            icon="✓"
          />
        </div>

        {/* Notification Filters */}
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search title or message..."
              className="rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#B3944D]"
            />

            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(0);
              }}
              className="rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#B3944D]"
            >
              <option value="">All notification types</option>
              <option value="order_placed">Order Placed</option>
              <option value="payment_successful">Payment Successful</option>
              <option value="order_confirmed">Order Confirmed</option>
              <option value="out_for_delivery">Out for Delivery</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(0);
              }}
              className="rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#B3944D]"
            >
              <option value="">All statuses</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </select>
          </div>
        </div>

        {/* Notification List */}
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-bold text-[#101B2D]">
              Customer Notification History
            </h2>
          </div>

          {error && (
            <div className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {loading ? (
            <div className="p-12 text-center text-gray-500">
              Loading notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <div className="mb-3 text-4xl">🔔</div>
              <p className="font-semibold">No notifications found</p>
              <p className="mt-1 text-sm">
                Try changing your search or filters.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map((item) => (
                <div
                  key={item.id}
                  className={`flex flex-col gap-4 p-5 transition hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between ${
                    !item.is_read ? "bg-amber-50/30" : ""
                  }`}
                >
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F3EBD8] text-lg text-[#947331]">
                      🔔
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-[#101B2D]">
                          {item.title}
                        </h3>

                        {!item.is_read && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                            Unread
                          </span>
                        )}
                      </div>

                      <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                        {item.message}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                        <span>Customer: {item.customer_name}</span>
                        <span>{item.customer_email}</span>
                        <span>{typeLabel(item.notification_type)}</span>
                        <span>{formatDate(item.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      onClick={() => setSelected(item)}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-[#101B2D] hover:bg-gray-100"
                    >
                      View
                    </button>

                    {!item.is_read && (
                      <button
                        onClick={() => markAsRead(item.id)}
                        className="rounded-lg bg-[#F3EBD8] px-3 py-2 text-xs font-semibold text-[#80642D] hover:bg-[#E9DDBF]"
                      >
                        Mark Read
                      </button>
                    )}

                    <button
                      onClick={() => deleteNotification(item.id)}
                      className="rounded-lg border border-red-100 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4">
            <span className="text-xs text-gray-500">
              Page {page + 1}
            </span>

            <div className="flex gap-2">
              <button
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>

              <button
                disabled={notifications.length < pageSize || loading}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Email & SMS Delivery History */}
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-gray-100 p-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-bold text-[#101B2D]">
                Delivery History
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Track customer email and SMS delivery records.
              </p>
            </div>

            <button
              onClick={loadDeliveries}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50"
            >
              ↻ Refresh
            </button>
          </div>

          {/* Delivery Statistics */}
          <div className="grid grid-cols-2 gap-3 p-5 lg:grid-cols-4">
            {[
              { label: "Total", value: deliveryStats.total_deliveries },
              { label: "Sent", value: deliveryStats.sent },
              { label: "Failed", value: deliveryStats.failed },
              { label: "Pending", value: deliveryStats.pending },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg bg-gray-50 p-4">
                <p className="text-xs text-gray-500">{stat.label}</p>
                <p className="mt-2 text-2xl font-bold text-[#101B2D]">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {/* Delivery Filters */}
          <div className="flex flex-col gap-3 px-5 pb-5 sm:flex-row">
            <select
              value={deliveryChannel}
              onChange={(e) => setDeliveryChannel(e.target.value)}
              className="rounded-lg border border-gray-200 px-4 py-3 text-sm"
            >
              <option value="">All Channels</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </select>

            <select
              value={deliveryStatus}
              onChange={(e) => setDeliveryStatus(e.target.value)}
              className="rounded-lg border border-gray-200 px-4 py-3 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          {deliveryError && (
            <div className="mx-5 mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {deliveryError}
            </div>
          )}

          {deliveryLoading ? (
            <div className="p-10 text-center text-gray-500">
              Loading delivery history...
            </div>
          ) : deliveries.length === 0 ? (
            <div className="p-10 text-center text-gray-500">
              <div className="mb-3 text-3xl">✉</div>
              <p className="font-semibold">No delivery records found</p>
              <p className="mt-1 text-sm">
                Email and SMS delivery records will appear here when available.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {deliveries.map((delivery) => (
                <div key={delivery.id} className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-[#101B2D]">
                        {delivery.notification_title}
                      </h3>
                      <p className="mt-1 text-xs text-gray-500">
                        Delivery ID: {delivery.id} · Notification ID:{" "}
                        {delivery.notification_id}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        delivery.status === "sent"
                          ? "bg-green-100 text-green-700"
                          : delivery.status === "failed"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {delivery.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                    <div>
                      <p className="text-xs text-gray-400">Customer</p>
                      <p className="font-medium text-gray-700">
                        {delivery.customer_name}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-400">Customer Email</p>
                      <p className="break-all font-medium text-gray-700">
                        {delivery.customer_email}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-400">Channel</p>
                      <p className="font-medium capitalize text-gray-700">
                        {delivery.channel}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-400">Recipient</p>
                      <p className="break-all font-medium text-gray-700">
                        {delivery.recipient}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-400">Attempts</p>
                      <p className="font-medium text-gray-700">
                        {delivery.attempts}
                      </p>
                    </div>
                  </div>

                  {delivery.error_message && (
                    <div className="rounded-lg bg-red-50 p-3">
                      <p className="text-xs font-semibold text-red-600">
                        Delivery Error
                      </p>
                      <p className="mt-1 text-sm text-red-700">
                        {delivery.error_message}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-4 text-xs text-gray-400">
                    <span>
                      Created: {formatDate(delivery.created_at)}
                    </span>

                    {delivery.sent_at && (
                      <span>
                        Sent: {formatDate(delivery.sent_at)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Notification Details Modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#101B2D]">
                Notification Details
              </h2>
              <button
                onClick={() => setSelected(null)}
                className="text-2xl text-gray-400 hover:text-gray-700"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <Detail label="Notification ID" value={selected.id} />
              <Detail label="Customer" value={selected.customer_name} />
              <Detail label="Customer Email" value={selected.customer_email} />
              <Detail label="Title" value={selected.title} />
              <Detail
                label="Type"
                value={typeLabel(selected.notification_type)}
              />
              <Detail label="Order ID" value={selected.order_id ?? "N/A"} />
              <Detail
                label="Status"
                value={selected.is_read ? "Read" : "Unread"}
              />
              <Detail
                label="Created At"
                value={formatDate(selected.created_at)}
              />

              <div>
                <p className="mb-1 font-semibold text-gray-500">Message</p>
                <p className="rounded-lg bg-gray-50 p-3 text-gray-700">
                  {selected.message}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              {!selected.is_read && (
                <button
                  onClick={() => markAsRead(selected.id)}
                  className="rounded-lg bg-[#F3EBD8] px-4 py-2 text-sm font-semibold text-[#80642D]"
                >
                  Mark as Read
                </button>
              )}

              <button
                onClick={() => deleteNotification(selected.id)}
                className="rounded-lg bg-red-50 px-4 py-2 text-sm font-semibold text-red-600"
              >
                Delete
              </button>

              <button
                onClick={() => setSelected(null)}
                className="rounded-lg bg-[#101B2D] px-4 py-2 text-sm font-semibold text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard = ({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: string;
}) => (
  <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <span className="text-xl text-[#B3944D]">{icon}</span>
    </div>
    <p className="mt-3 text-3xl font-bold text-[#101B2D]">{value}</p>
  </div>
);

const Detail = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <div className="flex justify-between gap-4 border-b border-gray-100 pb-2">
    <span className="font-medium text-gray-500">{label}</span>
    <span className="break-all text-right font-semibold text-[#101B2D]">
      {value}
    </span>
  </div>
);

export default Notifications;
