
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";

// --------------------------------------------------
// TYPES
// --------------------------------------------------

interface Summary {
  total_orders: number;
  today_orders: number;
  pending_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  total_customers: number;
  total_products: number;
  low_stock_products: number;
  total_revenue: number;
  today_revenue: number;
}

interface SalesItem {
  date?: string;
  month?: string;
  revenue: number;
}

interface BestSellingProduct {
  product_name: string;
  total_quantity_sold: number;
  total_sales: number;
}

interface LowStockProduct {
  id: number;
  name: string;
  category: string;
  stock: number;
  low_stock_threshold: number;
  price: number;
  is_available: boolean;
}

interface RecentOrder {
  id: number;
  order_number: string;
  customer_id: number;
  customer_name: string;
  delivery_type: string;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  order_status: string;
  created_at: string;
}

interface PaymentStatistics {
  total_payments: number;
  paid_payments: number;
  pending_payments: number;
  failed_payments: number;
  refunded_payments: number;
  online_collected: number;
  cod_collected: number;
  total_collected: number;
}

const emptySummary: Summary = {
  total_orders: 0,
  today_orders: 0,
  pending_orders: 0,
  completed_orders: 0,
  cancelled_orders: 0,
  total_customers: 0,
  total_products: 0,
  low_stock_products: 0,
  total_revenue: 0,
  today_revenue: 0,
};

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

const formatMoney = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

const formatDate = (value: string) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const statusClass = (status: string) => {
  switch (status?.toLowerCase()) {
    case "completed":
    case "paid":
      return "bg-green-100 text-green-700";

    case "pending":
    case "pending_payment":
      return "bg-yellow-100 text-yellow-700";

    case "cancelled":
    case "failed":
      return "bg-red-100 text-red-700";

    case "processing":
    case "confirmed":
      return "bg-blue-100 text-blue-700";

    default:
      return "bg-gray-100 text-gray-700";
  }
};

// --------------------------------------------------
// SALES CHART
// --------------------------------------------------

function DailySalesChart({ sales }: { sales: SalesItem[] }) {
  const maxRevenue = Math.max(
    ...sales.map((item) => Number(item.revenue || 0)),
    1
  );

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-[#101B2D]">Daily Sales</h3>
          <p className="text-xs text-gray-500">Last 7 days</p>
        </div>
      </div>

      {sales.length === 0 ? (
        <p className="py-10 text-center text-gray-500">
          No sales data available.
        </p>
      ) : (
        <div className="flex h-56 items-end gap-3 sm:gap-5">
          {sales.map((item, index) => {
            const height =
              (Number(item.revenue || 0) / maxRevenue) * 100;

            const label = item.date
              ? new Date(`${item.date}T00:00:00`).toLocaleDateString(
                  "en-IN",
                  { weekday: "short" }
                )
              : "";

            return (
              <div
                key={item.date || index}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
              >
                <span className="mb-2 text-center text-[10px] text-gray-500 sm:text-xs">
                  {formatMoney(item.revenue)}
                </span>

                <div className="flex h-36 w-full items-end">
                  <div
                    className="w-full rounded-t-lg bg-[#D6B875] transition-all hover:bg-[#b99c55]"
                    style={{
                      height: `${Math.max(height, 2)}%`,
                    }}
                    title={formatMoney(item.revenue)}
                  />
                </div>

                <span className="mt-2 text-xs text-gray-500">
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------
// MONTHLY SALES CHART
// --------------------------------------------------

function MonthlySalesChart({ sales }: { sales: SalesItem[] }) {
  const maxRevenue = Math.max(
    ...sales.map((item) => Number(item.revenue || 0)),
    1
  );

  return (
    <div>
      <h3 className="font-bold text-[#101B2D]">Monthly Sales</h3>
      <p className="mb-5 text-xs text-gray-500">Last 12 months</p>

      {sales.length === 0 ? (
        <p className="py-10 text-center text-gray-500">
          No monthly sales data available.
        </p>
      ) : (
        <div className="flex h-56 items-end gap-1 overflow-x-auto sm:gap-2">
          {sales.map((item, index) => {
            const height =
              (Number(item.revenue || 0) / maxRevenue) * 100;

            return (
              <div
                key={item.month || index}
                className="flex h-full min-w-[24px] flex-1 flex-col items-center justify-end"
                title={`${item.month}: ${formatMoney(item.revenue)}`}
              >
                <div className="flex h-40 w-full items-end">
                  <div
                    className="w-full rounded-t-md bg-[#1C2B42] transition-all hover:bg-[#D6B875]"
                    style={{
                      height: `${Math.max(height, 2)}%`,
                    }}
                  />
                </div>

                <span className="mt-2 whitespace-nowrap text-[10px] text-gray-500">
                  {item.month?.split(" ")[0]}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------
// SUMMARY CARD
// --------------------------------------------------

function SummaryCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: string;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{title}</p>

        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F7F5EF] text-xl">
          {icon}
        </span>
      </div>

      <h3 className="mt-3 text-2xl font-bold text-[#101B2D]">
        {value}
      </h3>

      <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
    </div>
  );
}

// --------------------------------------------------
// MAIN DASHBOARD
// --------------------------------------------------

function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [dailySales, setDailySales] = useState<SalesItem[]>([]);
  const [monthlySales, setMonthlySales] = useState<SalesItem[]>([]);
  const [bestProducts, setBestProducts] = useState<BestSellingProduct[]>([]);
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [payments, setPayments] = useState<PaymentStatistics | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // --------------------------------------------------
  // LOAD DASHBOARD DATA
  // --------------------------------------------------

  const loadDashboard = useCallback(async () => {
    setRefreshing(true);
    setError("");

    const endpoints = [
      {
        name: "summary",
        request: () => api.get("/admin/dashboard/summary"),
      },
      {
        name: "daily",
        request: () => api.get("/admin/dashboard/daily-sales"),
      },
      {
        name: "monthly",
        request: () => api.get("/admin/dashboard/monthly-sales"),
      },
      {
        name: "best",
        request: () =>
          api.get("/admin/dashboard/best-selling-products"),
      },
      {
        name: "stock",
        request: () =>
          api.get("/admin/dashboard/low-stock-products"),
      },
      {
        name: "orders",
        request: () =>
          api.get("/admin/dashboard/recent-orders?limit=8"),
      },
      {
        name: "payments",
        request: () =>
          api.get("/admin/dashboard/payment-statistics"),
      },
    ];

    const results = await Promise.allSettled(
      endpoints.map((endpoint) => endpoint.request())
    );

    const failed: string[] = [];

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        failed.push(endpoints[index].name);

        console.error(
          `Dashboard ${endpoints[index].name} API error:`,
          result.reason
        );

        return;
      }

      const data = result.value.data;

      switch (endpoints[index].name) {
        case "summary":
          setSummary(data);
          break;

        case "daily":
          setDailySales(data.sales || []);
          break;

        case "monthly":
          setMonthlySales(data.sales || []);
          break;

        case "best":
          setBestProducts(data || []);
          break;

        case "stock":
          setLowStock(data || []);
          break;

        case "orders":
          setRecentOrders(data || []);
          break;

        case "payments":
          setPayments(data);
          break;
      }
    });

    if (failed.length > 0) {
      setError(
        `Some dashboard sections could not load: ${failed.join(", ")}. Check the browser console for details.`
      );
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  // --------------------------------------------------
  // AUTHENTICATION
  // --------------------------------------------------

  useEffect(() => {
    if (authLoading) return;

    if (!user || !["admin", "super_admin"].includes(user.role)) {
      navigate("/login", { replace: true });
      return;
    }

    loadDashboard();
  }, [user, authLoading, navigate, loadDashboard]);

  // --------------------------------------------------
  // INITIAL LOADING
  // --------------------------------------------------

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-[#D6B875]" />

          <p className="text-sm text-gray-600">
            Loading G-MART dashboard...
          </p>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <div className="mx-auto max-w-7xl space-y-7">

      {/* PAGE TITLE */}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[#101B2D]">
            Dashboard Overview
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Monitor your store performance and business activity.
          </p>
        </div>

        <button
          onClick={loadDashboard}
          disabled={refreshing}
          className="rounded-lg bg-[#101B2D] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1C2B42] disabled:opacity-50"
        >
          {refreshing ? "Refreshing..." : "↻ Refresh"}
        </button>
      </div>

      {/* ERROR MESSAGE */}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* SUMMARY CARDS */}

      <section>
        <h3 className="mb-4 font-bold text-[#101B2D]">
          Business Summary
        </h3>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            title="Total Revenue"
            value={formatMoney(summary.total_revenue)}
            subtitle="Paid orders, excluding cancelled orders"
            icon="₹"
          />

          <SummaryCard
            title="Today's Revenue"
            value={formatMoney(summary.today_revenue)}
            subtitle={`${summary.today_orders} orders today`}
            icon="📈"
          />

          <SummaryCard
            title="Total Orders"
            value={summary.total_orders}
            subtitle={`${summary.pending_orders} pending orders`}
            icon="🛒"
          />

          <SummaryCard
            title="Total Customers"
            value={summary.total_customers}
            subtitle="Registered customers"
            icon="👥"
          />

          <SummaryCard
            title="Total Products"
            value={summary.total_products}
            subtitle="Products in your inventory"
            icon="📦"
          />

          <SummaryCard
            title="Low Stock"
            value={summary.low_stock_products}
            subtitle="Products needing restocking"
            icon="⚠️"
          />

          <SummaryCard
            title="Completed Orders"
            value={summary.completed_orders}
            subtitle="Successfully completed"
            icon="✅"
          />

          <SummaryCard
            title="Cancelled Orders"
            value={summary.cancelled_orders}
            subtitle="Cancelled orders"
            icon="❌"
          />
        </div>
      </section>

      {/* ORDER STATUS */}

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h3 className="mb-4 font-bold text-[#101B2D]">
          Order Status Overview
        </h3>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-yellow-50 p-4">
            <p className="text-sm text-yellow-700">Pending</p>
            <p className="mt-2 text-2xl font-bold text-yellow-800">
              {summary.pending_orders}
            </p>
          </div>

          <div className="rounded-lg bg-green-50 p-4">
            <p className="text-sm text-green-700">Completed</p>
            <p className="mt-2 text-2xl font-bold text-green-800">
              {summary.completed_orders}
            </p>
          </div>

          <div className="rounded-lg bg-red-50 p-4">
            <p className="text-sm text-red-700">Cancelled</p>
            <p className="mt-2 text-2xl font-bold text-red-800">
              {summary.cancelled_orders}
            </p>
          </div>
        </div>
      </section>

      {/* SALES CHARTS */}

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <DailySalesChart sales={dailySales} />
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <MonthlySalesChart sales={monthlySales} />
        </div>
      </section>

      {/* BEST SELLING PRODUCTS */}

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <div className="mb-5">
          <h3 className="font-bold text-[#101B2D]">
            Best-Selling Products
          </h3>

          <p className="text-xs text-gray-500">
            Based on paid, non-cancelled orders
          </p>
        </div>

        {bestProducts.length === 0 ? (
          <p className="py-6 text-center text-gray-500">
            No sales data available yet.
          </p>
        ) : (
          <div className="space-y-5">
            {bestProducts.map((product, index) => {
              const maximum = Math.max(
                ...bestProducts.map((item) =>
                  Number(item.total_quantity_sold)
                ),
                1
              );

              const percentage =
                (Number(product.total_quantity_sold) / maximum) * 100;

              return (
                <div key={`${product.product_name}-${index}`}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F7F5EF] text-sm font-bold text-[#101B2D]">
                        {index + 1}
                      </span>

                      <div>
                        <p className="font-semibold text-[#101B2D]">
                          {product.product_name}
                        </p>

                        <p className="text-xs text-gray-500">
                          {product.total_quantity_sold} sold
                        </p>
                      </div>
                    </div>

                    <p className="font-semibold text-[#101B2D]">
                      {formatMoney(product.total_sales)}
                    </p>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-[#D6B875]"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* LOW STOCK */}

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-[#101B2D]">
              Low Stock Alerts
            </h3>

            <p className="text-xs text-gray-500">
              Products that need restocking
            </p>
          </div>

          <Link
            to="/admin/inventory"
            className="text-sm font-semibold text-[#8c7137] hover:underline"
          >
            View Stock History →
          </Link>
        </div>

        {lowStock.length === 0 ? (
          <p className="py-6 text-center text-green-600">
            All products have sufficient stock.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[550px] text-left text-sm">
              <thead className="bg-[#F7F5EF] text-gray-600">
                <tr>
                  <th className="p-3">Product</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Available Stock</th>
                  <th className="p-3">Threshold</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>

              <tbody>
                {lowStock.map((product) => (
                  <tr
                    key={product.id}
                    className="border-b border-gray-100"
                  >
                    <td className="p-3 font-medium text-[#101B2D]">
                      {product.name}
                    </td>

                    <td className="p-3">{product.category}</td>

                    <td className="p-3 font-bold text-red-600">
                      {product.stock}
                    </td>

                    <td className="p-3">
                      {product.low_stock_threshold}
                    </td>

                    <td className="p-3">
                      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                        Low Stock
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* RECENT ORDERS */}

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-[#101B2D]">
              Recent Orders
            </h3>

            <p className="text-xs text-gray-500">
              Latest customer orders
            </p>
          </div>
        </div>

        {recentOrders.length === 0 ? (
          <p className="py-6 text-center text-gray-500">
            No orders found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-[#F7F5EF] text-gray-600">
                <tr>
                  <th className="p-3">Order Number</th>
                  <th className="p-3">Customer Name/ID</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Payment</th>
                  <th className="p-3">Order Status</th>
                </tr>
              </thead>

              <tbody>
                {recentOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-gray-100"
                  >
                    <td className="p-3 font-semibold text-[#101B2D]">
                      {order.order_number}
                    </td>

                    <td className="p-3">
                      <div>
                        <p className="font-semibold text-[#101B2D]">
                          {order.customer_name}
                        </p>

                        <p className="text-xs text-gray-500">
                          Customer ID: #{order.customer_id}
                        </p>
                      </div>
                    </td>

                    <td className="p-3 text-gray-500">
                      {formatDate(order.created_at)}
                    </td>

                    <td className="p-3 capitalize">
                      {order.delivery_type || "—"}
                    </td>

                    <td className="p-3 font-semibold">
                      {formatMoney(order.total_amount)}
                    </td>

                    <td className="p-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(order.payment_status)}`}
                      >
                        {order.payment_status}
                      </span>
                    </td>

                    <td className="p-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(order.order_status)}`}
                      >
                        {order.order_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* PAYMENT STATISTICS */}

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h3 className="font-bold text-[#101B2D]">
          Payment Statistics
        </h3>

        <p className="mb-5 text-xs text-gray-500">
          Online payments and cash collections
        </p>

        {!payments ? (
          <p className="py-5 text-center text-gray-500">
            Payment statistics unavailable.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg bg-[#F7F5EF] p-4">
                <p className="text-sm text-gray-500">
                  Total Collected
                </p>

                <p className="mt-2 text-2xl font-bold text-[#101B2D]">
                  {formatMoney(payments.total_collected)}
                </p>
              </div>

              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-sm text-blue-700">
                  Online Collected
                </p>

                <p className="mt-2 text-2xl font-bold text-blue-800">
                  {formatMoney(payments.online_collected)}
                </p>
              </div>

              <div className="rounded-lg bg-green-50 p-4">
                <p className="text-sm text-green-700">
                  Cash Collected
                </p>

                <p className="mt-2 text-2xl font-bold text-green-800">
                  {formatMoney(payments.cod_collected)}
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                {
                  label: "Total Payments",
                  value: payments.total_payments,
                },
                {
                  label: "Paid",
                  value: payments.paid_payments,
                },
                {
                  label: "Pending",
                  value: payments.pending_payments,
                },
                {
                  label: "Failed",
                  value: payments.failed_payments,
                },
                {
                  label: "Refunded",
                  value: payments.refunded_payments,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-gray-100 p-3 text-center"
                >
                  <p className="text-xs text-gray-500">
                    {item.label}
                  </p>

                  <p className="mt-2 text-xl font-bold text-[#101B2D]">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* FOOTER */}

      <footer className="border-t border-gray-200 py-5 text-center text-xs text-gray-500">
        G-MART Admin Dashboard · Store Management
      </footer>
    </div>
  );
}

export default Dashboard;
