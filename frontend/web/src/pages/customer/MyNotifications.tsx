
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../services/api";

interface NotificationItem {
  id: number;
  title: string;
  message: string;
  notification_type: string;
  order_id: number | null;
  is_read: boolean;
  created_at: string;
}

type FilterType = "all" | "unread" | "read";

function getNotificationIcon(type: string) {
  const value = type?.toLowerCase() || "";

  if (value.includes("payment")) return "💳";
  if (value.includes("order")) return "📦";
  if (value.includes("refund")) return "💰";
  if (value.includes("offer")) return "🏷️";

  return "🔔";
}

function MyNotifications() {
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // --------------------------------------------------
  // LOAD NOTIFICATIONS
  // --------------------------------------------------

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("/notifications/", {
        params: {
          skip: 0,
          limit: 100,
        },
      });

      const data = response.data;

      const list = Array.isArray(data)
        ? data
        : data.notifications || data.items || [];

      setNotifications(list);
    } catch (err) {
      console.error("Could not load notifications:", err);
      setError("Unable to load notifications. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // --------------------------------------------------
  // COUNTS
  // --------------------------------------------------

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications]
  );

  const readCount = notifications.length - unreadCount;

  // --------------------------------------------------
  // FILTER NOTIFICATIONS
  // --------------------------------------------------

  const filteredNotifications = useMemo(() => {
    if (filter === "unread") {
      return notifications.filter((item) => !item.is_read);
    }

    if (filter === "read") {
      return notifications.filter((item) => item.is_read);
    }

    return notifications;
  }, [notifications, filter]);

  // --------------------------------------------------
  // MARK ONE AS READ
  // --------------------------------------------------

  const handleMarkAsRead = async (id: number) => {
    try {
      await api.patch(`/notifications/${id}/read`);

      setNotifications((previous) =>
        previous.map((item) =>
          item.id === id ? { ...item, is_read: true } : item
        )
      );
    } catch (err) {
      console.error("Could not mark notification as read:", err);
      alert("Could not update notification. Please try again.");
    }
  };

  // --------------------------------------------------
  // MARK ALL AS READ
  // --------------------------------------------------

  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0) return;

    try {
      setActionLoading(true);

      await api.patch("/notifications/read-all");

      setNotifications((previous) =>
        previous.map((item) => ({ ...item, is_read: true }))
      );
    } catch (err) {
      console.error("Could not mark all notifications as read:", err);
      alert("Could not mark all notifications as read.");
    } finally {
      setActionLoading(false);
    }
  };

  // --------------------------------------------------
  // DELETE ONE NOTIFICATION
  // --------------------------------------------------

  const handleDelete = async (id: number) => {
    if (!window.confirm("Delete this notification?")) return;

    try {
      await api.delete(`/notifications/${id}`);

      setNotifications((previous) =>
        previous.filter((item) => item.id !== id)
      );
    } catch (err) {
      console.error("Could not delete notification:", err);
      alert("Could not delete notification. Please try again.");
    }
  };

  // --------------------------------------------------
  // DELETE ALL NOTIFICATIONS
  // --------------------------------------------------

  const handleDeleteAll = async () => {
    if (notifications.length === 0) return;

    if (
      !window.confirm(
        "Are you sure you want to delete all notifications? This cannot be undone."
      )
    ) {
      return;
    }

    try {
      setActionLoading(true);

      await api.delete("/notifications/");

      setNotifications([]);
    } catch (err) {
      console.error("Could not delete all notifications:", err);
      alert("Could not delete notifications. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  // --------------------------------------------------
  // OPEN NOTIFICATION
  // --------------------------------------------------

    const handleOpenNotification = (
    notification: NotificationItem
    ) => {
    // Mark as read without delaying navigation
    if (!notification.is_read) {
        void handleMarkAsRead(notification.id);
    }

    // Navigate to the specific order
    if (notification.order_id !== null) {
        window.location.href = `/my-orders?orderId=${notification.order_id}`;
    } else {
        window.location.href = "/my-orders";
    }
    };

  // --------------------------------------------------
  // DATE FORMAT
  // --------------------------------------------------

  const formatDate = (date: string) => {
    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return "Recently";
    }

    return parsedDate.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // --------------------------------------------------
  // PAGE
  // --------------------------------------------------

  return (
    <div className="min-h-screen bg-[#F7F5EF] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">

        {/* BREADCRUMB */}

        <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
          <Link to="/" className="transition hover:text-[#8A6D25]">
            Home
          </Link>
          <span>/</span>
          <span className="font-semibold text-[#101B2D]">
            My Notifications
          </span>
        </div>

        {/* PAGE HEADER */}

        <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#9A7A32]">
              Your Account
            </p>

            <h1 className="text-3xl font-black text-[#101B2D] sm:text-4xl">
              My Notifications
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Stay updated with your orders and payments.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleMarkAllAsRead}
              disabled={unreadCount === 0 || actionLoading}
              className="rounded-lg border border-[#D6B875] px-4 py-2.5 text-sm font-semibold text-[#8A6D25] transition hover:bg-[#D6B875]/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ✓ Mark all read
            </button>

            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={notifications.length === 0 || actionLoading}
              className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete all
            </button>
          </div>
        </div>

        {/* STATISTICS */}

        <div className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Total Notifications</p>
            <p className="mt-2 text-3xl font-black text-[#101B2D]">
              {notifications.length}
            </p>
          </div>

          <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Unread</p>
            <p className="mt-2 text-3xl font-black text-blue-600">
              {unreadCount}
            </p>
          </div>

          <div className="rounded-xl border border-emerald-100 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Read</p>
            <p className="mt-2 text-3xl font-black text-emerald-600">
              {readCount}
            </p>
          </div>
        </div>

        {/* FILTERS */}

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "all", label: "All" },
                { value: "unread", label: "Unread" },
                { value: "read", label: "Read" },
              ] as const
            ).map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                  filter === item.value
                    ? "bg-[#101B2D] text-white shadow"
                    : "border border-gray-200 bg-white text-gray-600 hover:border-[#D6B875] hover:text-[#8A6D25]"
                }`}
              >
                {item.label}
                {item.value === "unread" && unreadCount > 0 && (
                  <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] text-white">
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={loadNotifications}
            disabled={loading}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-[#8A6D25] transition hover:bg-[#D6B875]/20 disabled:opacity-50"
          >
            ↻ Refresh
          </button>
        </div>

        {/* NOTIFICATION LIST */}

        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

          {loading ? (
            <div className="px-5 py-16 text-center">
              <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-[#D6B875]/30 border-t-[#8A6D25]" />
              <p className="text-sm text-gray-500">
                Loading your notifications...
              </p>
            </div>
          ) : error ? (
            <div className="px-5 py-16 text-center">
              <p className="font-semibold text-red-600">{error}</p>

              <button
                type="button"
                onClick={loadNotifications}
                className="mt-4 rounded-lg bg-[#101B2D] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1C2B42]"
              >
                Try again
              </button>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="mb-4 text-5xl">🔔</div>

              <h2 className="text-lg font-bold text-[#101B2D]">
                {filter === "unread"
                  ? "You're all caught up!"
                  : filter === "read"
                    ? "No read notifications"
                    : "No notifications yet"}
              </h2>

              <p className="mt-2 text-sm text-gray-500">
                {filter === "unread"
                  ? "You don't have any unread notifications."
                  : "Your order and payment updates will appear here."}
              </p>

              <Link
                to="/"
                className="mt-6 inline-block rounded-lg bg-[#D6B875] px-5 py-2.5 text-sm font-bold text-[#101B2D] transition hover:bg-[#c7a85f]"
              >
                Continue Shopping
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`flex flex-col gap-4 p-5 transition hover:bg-[#F7F5EF]/70 sm:flex-row sm:items-start ${
                    !notification.is_read ? "bg-amber-50/40" : "bg-white"
                  }`}
                >
                  {/* ICON */}

                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#D6B875]/20 text-2xl">
                    {getNotificationIcon(
                      notification.notification_type
                    )}
                  </div>

                  {/* CONTENT */}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-[#101B2D]">
                        {notification.title}
                      </h3>

                      {!notification.is_read && (
                        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                          New
                        </span>
                      )}
                    </div>

                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-600">
                      {notification.message}
                    </p>

                    <p className="mt-3 text-xs text-gray-400">
                      {formatDate(notification.created_at)}
                    </p>

                    {notification.order_id && (
                      <button
                        type="button"
                        onClick={() => handleOpenNotification(notification)}
                        className="mt-3 text-sm font-bold text-[#8A6D25] transition hover:text-[#101B2D]"
                      >
                        View Order →
                      </button>
                    )}
                  </div>

                  {/* ACTIONS */}

                  <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                    {!notification.is_read && (
                      <button
                        type="button"
                        onClick={() => handleMarkAsRead(notification.id)}
                        title="Mark as read"
                        className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                      >
                        ✓ Mark read
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDelete(notification.id)}
                      title="Delete notification"
                      className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                    >
                      🗑 Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FOOTER */}

        {!loading && notifications.length > 0 && (
          <p className="mt-5 text-center text-xs text-gray-400">
            Showing {filteredNotifications.length} of {notifications.length} notifications
          </p>
        )}
      </div>
    </div>
  );
}

export default MyNotifications;
