
import { useCallback, useEffect, useState } from "react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";

interface Customer {
  id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
  created_at: string | null;
}

interface CustomerSummary {
  total_customers: number;
  active_customers: number;
  inactive_customers: number;
  new_customers_last_30_days: number;
  repeat_customers: number;
  total_customer_spending: number | string;
}

interface CustomerListResponse {
  total: number;
  skip: number;
  limit: number;
  items: Customer[];
}

interface CustomerOverview extends Customer {
  total_orders: number;
  non_cancelled_orders: number;
  total_spending: number | string;
}

interface CustomerOrder {
  id: number;
  order_number: string;
  total_amount: number | string;
  payment_status: string;
  order_status: string;
  payment_method: string;
  delivery_type: string;
  created_at: string | null;
}

const PAGE_SIZE = 10;

const formatCurrency = (value: number | string | null | undefined) =>
  `₹${Number(value || 0).toFixed(2)}`;

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

const formatStatus = (status: string) =>
  status.replaceAll("_", " ").replace(/\b\w/g, (char) =>
    char.toUpperCase()
  );

function Customers() {
  const { user } = useAuth();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);

  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerOverview | null>(null);

  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);

  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const isAdmin =
    user?.role === "admin" || user?.role === "super_admin";

  // Load customer statistics.
  const loadSummary = useCallback(async () => {
    try {
      const response = await api.get<CustomerSummary>(
        "/admin/customers/summary"
      );

      setSummary(response.data);
    } catch (err: any) {
      console.error(
        "Could not load customer summary:",
        err.response?.data || err
      );
    }
  }, []);

  // Load customers with search, filter and pagination.
  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get<CustomerListResponse>(
        "/admin/customers/list",
        {
          params: {
            skip: (page - 1) * PAGE_SIZE,
            limit: PAGE_SIZE,
            ...(search.trim() && { keyword: search.trim() }),
            ...(statusFilter !== "" && {
              is_active: statusFilter === "active",
            }),
          },
        }
      );

      setCustomers(response.data.items);
      setTotal(response.data.total);
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Could not load customers."
      );
      setCustomers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    if (!isAdmin) return;

    loadSummary();
  }, [isAdmin, loadSummary]);

  useEffect(() => {
    if (!isAdmin) return;

    loadCustomers();
  }, [isAdmin, loadCustomers]);

  // Reset pagination when search or filter changes.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Open customer details and order history.
  const viewCustomer = async (customerId: number) => {
    setDetailsLoading(true);
    setSelectedCustomer(null);
    setCustomerOrders([]);
    setError("");

    try {
      const [overviewResponse, ordersResponse] = await Promise.all([
        api.get<CustomerOverview>(
          `/admin/customers/${customerId}/overview`
        ),
        api.get<CustomerOrder[]>(
          `/admin/customers/${customerId}/orders`,
          {
            params: {
              skip: 0,
              limit: 10,
            },
          }
        ),
      ]);

      setSelectedCustomer(overviewResponse.data);
      setCustomerOrders(ordersResponse.data);
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          "Could not load customer details."
      );
    } finally {
      setDetailsLoading(false);
    }
  };

  // Activate or deactivate a customer.
  const toggleCustomerStatus = async (customer: Customer) => {
    const newStatus = !customer.is_active;

    const confirmed = window.confirm(
      `Are you sure you want to ${
        newStatus ? "activate" : "deactivate"
      } ${customer.full_name}?`
    );

    if (!confirmed) return;

    setUpdatingId(customer.id);
    setError("");
    setSuccess("");

    try {
      await api.patch(`/admin/customers/${customer.id}/status`, {
        is_active: newStatus,
      });

      setSuccess(
        `${customer.full_name} has been ${
          newStatus ? "activated" : "deactivated"
        } successfully.`
      );

      await Promise.all([loadCustomers(), loadSummary()]);

      if (selectedCustomer?.id === customer.id) {
        const response = await api.get<CustomerOverview>(
          `/admin/customers/${customer.id}/overview`
        );

        setSelectedCustomer(response.data);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          "Could not update customer status."
      );
    } finally {
      setUpdatingId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-4xl rounded-xl bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-bold text-gray-800">
            Access denied
          </h2>
          <p className="mt-2 text-gray-500">
            You need an admin account to manage customers.
          </p>
        </div>
      </div>
    );
  }

  const summaryCards = [
    {
      label: "Total Customers",
      value: summary?.total_customers ?? 0,
      icon: "👥",
      color: "bg-blue-50 text-blue-700",
    },
    {
      label: "Active Customers",
      value: summary?.active_customers ?? 0,
      icon: "✓",
      color: "bg-green-50 text-green-700",
    },
    {
      label: "Inactive Customers",
      value: summary?.inactive_customers ?? 0,
      icon: "⊘",
      color: "bg-red-50 text-red-700",
    },
    {
      label: "New Customers (30 Days)",
      value: summary?.new_customers_last_30_days ?? 0,
      icon: "✨",
      color: "bg-purple-50 text-purple-700",
    },
    {
      label: "Repeat Customers",
      value: summary?.repeat_customers ?? 0,
      icon: "🔁",
      color: "bg-indigo-50 text-indigo-700",
    },
  ];

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
              Customer Management
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              View customers, manage accounts and track customer activity.
            </p>
          </div>

          <button
            onClick={() => {
              loadCustomers();
              loadSummary();
            }}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            ↻ Refresh Customers
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
        <div className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {summaryCards.map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-gray-500">{item.label}</p>

                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg ${item.color}`}
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

        {/* Spending card */}
        <div className="mb-7 rounded-xl bg-[#101B2D] p-6 text-white shadow-sm">
          <p className="text-sm text-gray-300">
            Total Customer Spending
          </p>

          <p className="mt-2 text-3xl font-bold">
            {formatCurrency(summary?.total_customer_spending)}
          </p>

          <p className="mt-1 text-xs text-gray-400">
            Calculated from paid orders.
          </p>
        </div>

        {/* Search and filters */}
        <div className="mb-6 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-[#101B2D]">
            Find Customers
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-600">
                Search Customers
              </label>

              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email or phone..."
                className="form-input"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-600">
                Account Status
              </label>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="form-input"
              >
                <option value="">All Customers</option>
                <option value="active">Active Customers</option>
                <option value="inactive">Inactive Customers</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("");
                setPage(1);
              }}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Customer table */}
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-2 border-b border-gray-100 p-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-bold text-[#101B2D]">
                All Customers
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                View and manage registered store customers.
              </p>
            </div>

            <span className="text-sm text-gray-500">
              {total} customers found
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-500">
              Loading customers...
            </div>
          ) : customers.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-4xl">👥</div>

              <h3 className="mt-3 font-semibold text-gray-700">
                No customers found
              </h3>

              <p className="mt-1 text-sm text-gray-500">
                Try changing your search or filters.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[950px] text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-5 py-4">Customer</th>
                      <th className="px-5 py-4">Contact</th>
                      <th className="px-5 py-4">Registered</th>
                      <th className="px-5 py-4">Status</th>
                      <th className="px-5 py-4">Actions</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {customers.map((customer) => (
                      <tr
                        key={customer.id}
                        className="transition hover:bg-gray-50"
                      >
                        <td className="px-5 py-4">
                          <p className="font-semibold text-[#101B2D]">
                            {customer.full_name}
                          </p>

                          <p className="mt-1 text-xs text-gray-400">
                            Customer ID: #{customer.id}
                          </p>
                        </td>

                        <td className="px-5 py-4">
                          <p className="text-gray-700">
                            {customer.email || "No email"}
                          </p>

                          <p className="mt-1 text-xs text-gray-500">
                            {customer.phone || "No phone"}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-gray-600">
                          {formatDate(customer.created_at)}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                              customer.is_active
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {customer.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => viewCustomer(customer.id)}
                              className="rounded-lg bg-[#101B2D] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#1C2B42]"
                            >
                              View Details
                            </button>

                            <button
                              disabled={updatingId === customer.id}
                              onClick={() =>
                                toggleCustomerStatus(customer)
                              }
                              className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
                                customer.is_active
                                  ? "bg-red-50 text-red-700 hover:bg-red-100"
                                  : "bg-green-50 text-green-700 hover:bg-green-100"
                              }`}
                            >
                              {updatingId === customer.id
                                ? "Updating..."
                                : customer.is_active
                                  ? "Deactivate"
                                  : "Activate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
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

      {/* Customer details modal */}
      {(selectedCustomer || detailsLoading) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6"
          onClick={() => {
            if (!detailsLoading) setSelectedCustomer(null);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {detailsLoading ? (
              <div className="p-12 text-center text-gray-500">
                Loading customer details...
              </div>
            ) : selectedCustomer ? (
              <>
                {/* Modal header */}
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white p-5 sm:p-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#B3944D]">
                      CUSTOMER PROFILE
                    </p>

                    <h2 className="mt-1 text-xl font-bold text-[#101B2D]">
                      {selectedCustomer.full_name}
                    </h2>

                    <p className="mt-1 text-xs text-gray-500">
                      Customer ID: #{selectedCustomer.id}
                    </p>
                  </div>

                  <button
                    onClick={() => setSelectedCustomer(null)}
                    className="rounded-lg bg-gray-100 px-3 py-2 text-gray-600 transition hover:bg-gray-200"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-6 p-5 sm:p-6">
                  {/* Customer information */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-xl bg-gray-50 p-4">
                      <p className="text-xs font-medium uppercase text-gray-500">
                        Email Address
                      </p>

                      <p className="mt-2 break-all font-semibold text-[#101B2D]">
                        {selectedCustomer.email || "Not provided"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-gray-50 p-4">
                      <p className="text-xs font-medium uppercase text-gray-500">
                        Phone Number
                      </p>

                      <p className="mt-2 font-semibold text-[#101B2D]">
                        {selectedCustomer.phone || "Not provided"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-gray-50 p-4">
                      <p className="text-xs font-medium uppercase text-gray-500">
                        Registration Date
                      </p>

                      <p className="mt-2 font-semibold text-[#101B2D]">
                        {formatDate(selectedCustomer.created_at)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-gray-50 p-4">
                      <p className="text-xs font-medium uppercase text-gray-500">
                        Account Status
                      </p>

                      <span
                        className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                          selectedCustomer.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {selectedCustomer.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>

                  {/* Customer statistics */}
                  <div>
                    <h3 className="mb-3 font-bold text-[#101B2D]">
                      Customer Activity
                    </h3>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="rounded-xl border border-gray-100 p-4">
                        <p className="text-sm text-gray-500">
                          Total Orders
                        </p>

                        <p className="mt-2 text-2xl font-bold text-[#101B2D]">
                          {selectedCustomer.total_orders}
                        </p>
                      </div>

                      <div className="rounded-xl border border-gray-100 p-4">
                        <p className="text-sm text-gray-500">
                          Non-cancelled Orders
                        </p>

                        <p className="mt-2 text-2xl font-bold text-[#101B2D]">
                          {selectedCustomer.non_cancelled_orders}
                        </p>
                      </div>

                      <div className="rounded-xl border border-gray-100 p-4">
                        <p className="text-sm text-gray-500">
                          Total Spending
                        </p>

                        <p className="mt-2 text-2xl font-bold text-[#101B2D]">
                          {formatCurrency(selectedCustomer.total_spending)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Customer order history */}
                  <div>
                    <h3 className="mb-3 font-bold text-[#101B2D]">
                      Recent Order History
                    </h3>

                    {customerOrders.length === 0 ? (
                      <div className="rounded-xl bg-gray-50 p-8 text-center text-sm text-gray-500">
                        This customer has not placed any orders yet.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-gray-100">
                        <table className="w-full min-w-[650px] text-left text-sm">
                          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                            <tr>
                              <th className="px-4 py-3">Order</th>
                              <th className="px-4 py-3">Date</th>
                              <th className="px-4 py-3">Amount</th>
                              <th className="px-4 py-3">Payment</th>
                              <th className="px-4 py-3">Status</th>
                            </tr>
                          </thead>

                          <tbody className="divide-y divide-gray-100">
                            {customerOrders.map((order) => (
                              <tr key={order.id}>
                                <td className="px-4 py-3 font-semibold text-[#101B2D]">
                                  {order.order_number}
                                </td>

                                <td className="px-4 py-3 text-gray-600">
                                  {formatDate(order.created_at)}
                                </td>

                                <td className="px-4 py-3 font-semibold">
                                  {formatCurrency(order.total_amount)}
                                </td>

                                <td className="px-4 py-3">
                                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                                    {formatStatus(order.payment_status)}
                                  </span>
                                </td>

                                <td className="px-4 py-3">
                                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                                    {formatStatus(order.order_status)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <p className="mt-2 text-xs text-gray-400">
                      Showing the 10 most recent orders.
                    </p>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default Customers;
