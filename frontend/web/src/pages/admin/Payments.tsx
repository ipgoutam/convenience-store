import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Search,
  CreditCard,
  Wallet,
  Clock,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

import api from "../../services/api";

interface Order {
  id: number;
  order_number: string;
  customer_id: number;
  delivery_type: "pickup" | "delivery";
  customer_phone: string | null;
  total_amount: number | string;
  payment_method: string;
  payment_status: string;
  order_status: string;
  created_at: string | null;
}

const PAGE_SIZE = 100;

const formatCurrency = (value: number) =>
  `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const toAmount = (value: number | string) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const formatStatus = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (letter) =>
    letter.toUpperCase()
  );

const isCashDelivery = (order: Order) =>
  order.payment_method.toLowerCase() === "cash" &&
  order.delivery_type === "delivery";

const isCodDue = (order: Order) =>
  isCashDelivery(order) &&
  order.payment_status === "pending" &&
  ["out_for_delivery", "completed"].includes(order.order_status);

const getCodStatus = (order: Order) => {
  if (!isCashDelivery(order)) return "Not applicable";

  if (order.payment_status === "paid") return "Collected";

  if (order.payment_status !== "pending") {
    return formatStatus(order.payment_status);
  }

  if (order.order_status === "cancelled") return "Cancelled";

  if (isCodDue(order)) return "Pending collection";

  return "Not yet due";
};

function Payments() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [codFilter, setCodFilter] = useState("all");

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const allOrders: Order[] = [];
      let skip = 0;

      while (true) {
        const response = await api.get<Order[]>("/orders/admin/all", {
          params: {
            skip,
            limit: PAGE_SIZE,
          },
        });

        const batch = response.data;

        allOrders.push(...batch);

        if (batch.length < PAGE_SIZE) break;

        skip += PAGE_SIZE;
      }

      setOrders(allOrders);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          "Could not load payment information. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const summary = useMemo(() => {
    const paidOrders = orders.filter(
      (order) => order.payment_status === "paid"
    );

    const pendingOrders = orders.filter(
      (order) =>
        order.payment_status === "pending" &&
        order.order_status !== "cancelled"
    );

    const codCollectedOrders = paidOrders.filter(isCashDelivery);

    const codPendingOrders = orders.filter(isCodDue);

    const onlineCollectedOrders = paidOrders.filter(
      (order) => order.payment_method.toLowerCase() !== "cash"
    );

    const refundedOrders = orders.filter(
      (order) => order.payment_status === "refunded"
    );

    const failedOrders = orders.filter(
      (order) => order.payment_status === "failed"
    );

    const sum = (items: Order[]) =>
      items.reduce(
        (total, order) => total + toAmount(order.total_amount),
        0
      );

    return {
      totalOrders: orders.length,
      paidAmount: sum(paidOrders),
      pendingAmount: sum(pendingOrders),
      codCollected: sum(codCollectedOrders),
      codPending: sum(codPendingOrders),
      onlineCollected: sum(onlineCollectedOrders),
      refundedAmount: sum(refundedOrders),
      failedCount: failedOrders.length,
      paidCount: paidOrders.length,
      pendingCount: pendingOrders.length,
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesSearch =
        !keyword ||
        order.order_number.toLowerCase().includes(keyword) ||
        String(order.customer_id).includes(keyword) ||
        (order.customer_phone || "").includes(keyword);

      const matchesPaymentStatus =
        paymentStatusFilter === "all" ||
        order.payment_status === paymentStatusFilter;

      const matchesMethod =
        methodFilter === "all" ||
        order.payment_method.toLowerCase() === methodFilter;

      const codStatus = getCodStatus(order);

      const matchesCod =
        codFilter === "all" ||
        (codFilter === "collected" && codStatus === "Collected") ||
        (codFilter === "pending" && codStatus === "Pending collection") ||
        (codFilter === "not_due" && codStatus === "Not yet due");

      return (
        matchesSearch &&
        matchesPaymentStatus &&
        matchesMethod &&
        matchesCod
      );
    });
  }, [
    orders,
    search,
    paymentStatusFilter,
    methodFilter,
    codFilter,
  ]);

  const statusClass = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-green-100 text-green-700";
      case "pending":
        return "bg-amber-100 text-amber-700";
      case "failed":
        return "bg-red-100 text-red-700";
      case "refunded":
        return "bg-slate-100 text-slate-600";
      default:
        return "bg-slate-100 text-slate-600";
    }
  };

  const codStatusClass = (status: string) => {
    if (status === "Collected") {
      return "bg-green-100 text-green-700";
    }

    if (status === "Pending collection") {
      return "bg-amber-100 text-amber-700";
    }

    return "bg-slate-100 text-slate-600";
  };

  const summaryCards = [
    {
      label: "Total Collected",
      value: formatCurrency(summary.paidAmount),
      detail: `${summary.paidCount} paid orders`,
      icon: Wallet,
    },
    {
      label: "Pending Payments",
      value: formatCurrency(summary.pendingAmount),
      detail: `${summary.pendingCount} unpaid active orders`,
      icon: Clock,
    },
    {
      label: "COD Collected",
      value: formatCurrency(summary.codCollected),
      detail: "Cash delivery payments received",
      icon: CheckCircle,
    },
    {
      label: "COD to Collect",
      value: formatCurrency(summary.codPending),
      detail: "Orders currently out for delivery",
      icon: AlertCircle,
    },
  ];

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Payments
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitor collected payments, pending amounts, and COD collections.
          </p>
        </div>

        <button
          type="button"
          onClick={loadPayments}
          disabled={loading}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            size={16}
            className={loading ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* SUMMARY CARDS */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;

          return (
            <div
              key={card.label}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">
                  {card.label}
                </p>

                <div className="rounded-lg bg-amber-50 p-2 text-amber-700">
                  <Icon size={20} />
                </div>
              </div>

              <p className="mt-3 text-2xl font-bold text-slate-800">
                {card.value}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {card.detail}
              </p>
            </div>
          );
        })}
      </div>

      {/* ADDITIONAL PAYMENT INFORMATION */}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">
            Online Payments Collected
          </p>
          <p className="mt-2 text-xl font-bold text-slate-800">
            {formatCurrency(summary.onlineCollected)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Paid orders using non-cash methods
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">
            Refunded Amount
          </p>
          <p className="mt-2 text-xl font-bold text-slate-800">
            {formatCurrency(summary.refundedAmount)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Orders marked as refunded
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">
            Failed Payments
          </p>
          <p className="mt-2 text-xl font-bold text-slate-800">
            {summary.failedCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Orders with failed payment status
          </p>
        </div>
      </div>

      {/* PAYMENT RECORDS */}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                Payment Records
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {filteredOrders.length} of {orders.length} orders
              </p>
            </div>

            <div className="relative w-full sm:max-w-xs">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search order, customer ID, phone..."
                className="min-h-10 w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* FILTERS */}

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select
              value={paymentStatusFilter}
              onChange={(event) =>
                setPaymentStatusFilter(event.target.value)
              }
              className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-amber-500"
            >
              <option value="all">All Payment Statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>

            <select
              value={methodFilter}
              onChange={(event) => setMethodFilter(event.target.value)}
              className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-amber-500"
            >
              <option value="all">All Payment Methods</option>
              <option value="cash">Cash</option>
              <option value="online">Online</option>
            </select>

            <select
              value={codFilter}
              onChange={(event) => setCodFilter(event.target.value)}
              className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-amber-500"
            >
              <option value="all">All COD Statuses</option>
              <option value="collected">COD Collected</option>
              <option value="pending">COD Pending Collection</option>
              <option value="not_due">COD Not Yet Due</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-slate-500">
            Loading payment records...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-16 text-center">
            <CreditCard
              size={36}
              className="mx-auto text-slate-300"
            />
            <p className="mt-3 font-medium text-slate-700">
              No payment records found.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Try changing your search or filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">Order</th>
                  <th className="px-5 py-4">Customer</th>
                  <th className="px-5 py-4">Date</th>
                  <th className="px-5 py-4">Amount</th>
                  <th className="px-5 py-4">Method</th>
                  <th className="px-5 py-4">Payment Status</th>
                  <th className="px-5 py-4">Order Status</th>
                  <th className="px-5 py-4">COD Collection</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((order) => {
                  const codStatus = getCodStatus(order);

                  return (
                    <tr
                      key={order.id}
                      className="transition hover:bg-slate-50"
                    >
                      <td className="px-5 py-4 font-semibold text-slate-800">
                        #{order.order_number}
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-700">
                          Customer #{order.customer_id}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {order.customer_phone || "No phone"}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {order.created_at
                          ? new Date(order.created_at).toLocaleString(
                              "en-IN",
                              {
                                dateStyle: "medium",
                                timeStyle: "short",
                              }
                            )
                          : "—"}
                      </td>

                      <td className="px-5 py-4 font-semibold text-slate-800">
                        {formatCurrency(toAmount(order.total_amount))}
                      </td>

                      <td className="px-5 py-4">
                        <span className="capitalize text-slate-700">
                          {formatStatus(order.payment_method)}
                        </span>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatStatus(order.delivery_type)}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(
                            order.payment_status
                          )}`}
                        >
                          {formatStatus(order.payment_status)}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {formatStatus(order.order_status)}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${codStatusClass(
                            codStatus
                          )}`}
                        >
                          {codStatus}
                        </span>

                        {isCodDue(order) && (
                          <p className="mt-1 text-xs text-slate-500">
                            Manage in Orders
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs leading-5 text-slate-500">
        Payment totals are calculated from saved orders. Pending COD is counted
        as collectible only when the delivery order is out for delivery or
        completed. Online payment gateway processing is not enabled by this
        report.
      </p>
    </div>
  );
}

export default Payments;