
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  TicketPercent,
  Pencil,
  Trash2,
  X,
  RefreshCw,
  CalendarDays,
  Users,
  TrendingUp,
  Tag,
} from "lucide-react";

import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";

interface Coupon {
  id: number;
  code: string;
  description: string | null;
  discount_type: "percentage" | "fixed";
  discount_value: number | string;
  min_order_amount: number | string;
  max_discount_amount: number | string | null;
  start_date: string;
  expiry_date: string;
  max_uses: number | null;
  usage_count: number;
  is_active: boolean;
  created_at: string | null;
}

interface CouponForm {
  code: string;
  description: string;
  discount_type: "percentage" | "fixed";
  discount_value: string;
  min_order_amount: string;
  max_discount_amount: string;
  start_date: string;
  expiry_date: string;
  max_uses: string;
  is_active: boolean;
}

const emptyForm = (): CouponForm => {
  const now = new Date();
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 7);

  return {
    code: "",
    description: "",
    discount_type: "percentage",
    discount_value: "",
    min_order_amount: "0",
    max_discount_amount: "",
    start_date: toLocalInput(now),
    expiry_date: toLocalInput(expiry),
    max_uses: "",
    is_active: true,
  };
};

function toLocalInput(date: Date) {
  const local = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  );
  return local.toISOString().slice(0, 16);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(value: number | string | null) {
  return `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getCouponStatus(coupon: Coupon) {
  const now = Date.now();

  if (!coupon.is_active) return "Inactive";
  if (now < new Date(coupon.start_date).getTime()) return "Scheduled";
  if (now >= new Date(coupon.expiry_date).getTime()) return "Expired";
  if (
    coupon.max_uses !== null &&
    coupon.usage_count >= coupon.max_uses
  ) return "Limit reached";

  return "Active";
}

function getErrorMessage(error: any) {
  return (
    error?.response?.data?.detail ||
    error?.message ||
    "Something went wrong. Please try again."
  );
}

function Coupons() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponForm>(emptyForm());
  const [error, setError] = useState("");

  useEffect(() => {
    if (
      !authLoading &&
      (!user || !["admin", "super_admin"].includes(user.role))
    ) {
      navigate("/login", { replace: true });
    }
  }, [user, authLoading, navigate]);

  const loadCoupons = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get("/coupons/");
      setCoupons(response.data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (
      !authLoading &&
      user &&
      ["admin", "super_admin"].includes(user.role)
    ) {
      loadCoupons();
    }
  }, [authLoading, user, loadCoupons]);

  const stats = useMemo(() => {
    const active = coupons.filter(
      (coupon) => getCouponStatus(coupon) === "Active"
    ).length;

    const expired = coupons.filter(
      (coupon) => getCouponStatus(coupon) === "Expired"
    ).length;

    const totalUses = coupons.reduce(
      (sum, coupon) => sum + coupon.usage_count,
      0
    );

    return {
      total: coupons.length,
      active,
      expired,
      totalUses,
    };
  }, [coupons]);

  const filteredCoupons = useMemo(() => {
    return coupons.filter((coupon) => {
      const keyword = search.trim().toLowerCase();

      const matchesSearch =
        !keyword ||
        coupon.code.toLowerCase().includes(keyword) ||
        (coupon.description || "").toLowerCase().includes(keyword);

      const status = getCouponStatus(coupon);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && status === "Active") ||
        (statusFilter === "expired" && status === "Expired") ||
        (statusFilter === "inactive" && status === "Inactive") ||
        (statusFilter === "scheduled" && status === "Scheduled");

      return matchesSearch && matchesStatus;
    });
  }, [coupons, search, statusFilter]);

  const openCreateModal = () => {
    setEditingCoupon(null);
    setForm(emptyForm());
    setError("");
    setShowModal(true);
  };

  const openEditModal = (coupon: Coupon) => {
    setEditingCoupon(coupon);

    setForm({
      code: coupon.code,
      description: coupon.description || "",
      discount_type: coupon.discount_type,
      discount_value: String(coupon.discount_value),
      min_order_amount: String(coupon.min_order_amount),
      max_discount_amount: coupon.max_discount_amount
        ? String(coupon.max_discount_amount)
        : "",
      start_date: toLocalInput(new Date(coupon.start_date)),
      expiry_date: toLocalInput(new Date(coupon.expiry_date)),
      max_uses: coupon.max_uses === null
        ? ""
        : String(coupon.max_uses),
      is_active: coupon.is_active,
    });

    setError("");
    setShowModal(true);
  };

  const closeModal = () => {
    if (saving) return;
    setShowModal(false);
    setEditingCoupon(null);
    setError("");
  };

  const handleChange = (
    field: keyof CouponForm,
    value: string | boolean
  ) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!editingCoupon && form.code.trim().length < 3) {
      setError("Coupon code must contain at least 3 characters.");
      return;
    }

    const discountValue = Number(form.discount_value);
    const minimumAmount = Number(form.min_order_amount);

    if (!discountValue || discountValue <= 0) {
      setError("Enter a valid discount value.");
      return;
    }

    if (
      form.discount_type === "percentage" &&
      discountValue > 100
    ) {
      setError("Percentage discount cannot exceed 100.");
      return;
    }

    if (!Number.isFinite(minimumAmount) || minimumAmount < 0) {
      setError("Enter a valid minimum order amount.");
      return;
    }

    if (
      form.discount_type === "percentage" &&
      form.max_discount_amount &&
      Number(form.max_discount_amount) <= 0
    ) {
      setError("Maximum discount must be greater than zero.");
      return;
    }

    const startDate = new Date(form.start_date);
    const expiryDate = new Date(form.expiry_date);

    if (
      !form.start_date ||
      !form.expiry_date ||
      expiryDate <= startDate
    ) {
      setError("Expiry date must be later than start date.");
      return;
    }

    if (form.max_uses && Number(form.max_uses) <= 0) {
      setError("Maximum uses must be greater than zero.");
      return;
    }

    const payload = {
      description: form.description.trim() || null,
      discount_type: form.discount_type,
      discount_value: discountValue,
      min_order_amount: minimumAmount,
      max_discount_amount:
        form.discount_type === "percentage" &&
        form.max_discount_amount
          ? Number(form.max_discount_amount)
          : null,
      start_date: startDate.toISOString(),
      expiry_date: expiryDate.toISOString(),
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      is_active: form.is_active,
    };

    try {
      setSaving(true);

      if (editingCoupon) {
        await api.put(
          `/coupons/${editingCoupon.id}`,
          payload
        );
      } else {
        await api.post("/coupons/", {
          ...payload,
          code: form.code.trim().toUpperCase(),
        });
      }

      setShowModal(false);
      setEditingCoupon(null);
      await loadCoupons();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (coupon: Coupon) => {
    try {
      await api.put(`/coupons/${coupon.id}`, {
        is_active: !coupon.is_active,
      });

      await loadCoupons();
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  const deleteCoupon = async (coupon: Coupon) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete coupon ${coupon.code}?`
    );

    if (!confirmed) return;

    try {
      await api.delete(`/coupons/${coupon.id}`);
      await loadCoupons();
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  if (
    authLoading ||
    !user ||
    !["admin", "super_admin"].includes(user.role)
  ) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-gray-200 border-t-[#B3944D]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-[#101B2D]">

      {/* PAGE HEADER */}

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-[#B3944D]">
            SALES MANAGEMENT
          </p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
            Coupons Management
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Create and manage your store discount coupons.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#101B2D] px-5 py-3 text-sm font-semibold text-white shadow transition hover:bg-[#1C2B42]"
        >
          <Plus size={18} />
          Create Coupon
        </button>
      </div>

      {/* STATISTICS */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

        {[
          {
            label: "Total Coupons",
            value: stats.total,
            icon: TicketPercent,
          },
          {
            label: "Active Coupons",
            value: stats.active,
            icon: Tag,
          },
          {
            label: "Expired Coupons",
            value: stats.expired,
            icon: CalendarDays,
          },
          {
            label: "Total Redemptions",
            value: stats.totalUses,
            icon: TrendingUp,
          },
        ].map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.label}
              className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">
                    {item.label}
                  </p>
                  <h2 className="mt-2 text-2xl font-bold">
                    {item.value.toLocaleString("en-IN")}
                  </h2>
                </div>

                <div className="rounded-xl bg-[#F7F3E9] p-3 text-[#B3944D]">
                  <Icon size={23} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* COUPON TABLE */}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

        <div className="flex flex-col gap-3 border-b border-gray-100 p-5 lg:flex-row lg:items-center lg:justify-between">

          <div>
            <h2 className="text-lg font-bold">
              All Coupons
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              {filteredCoupons.length} coupon(s) found
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">

            <div className="relative">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search coupon..."
                className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#B3944D] sm:w-56"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#B3944D]"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="scheduled">Scheduled</option>
              <option value="expired">Expired</option>
              <option value="inactive">Inactive</option>
            </select>

            <button
              onClick={loadCoupons}
              title="Refresh coupons"
              className="flex items-center justify-center rounded-xl border border-gray-200 px-3 py-2.5 text-gray-600 transition hover:bg-gray-50"
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </div>

        {error && !showModal && (
          <div className="m-5 rounded-xl bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-56 items-center justify-center">
            <div className="h-9 w-9 animate-spin rounded-full border-4 border-gray-200 border-t-[#B3944D]" />
          </div>
        ) : filteredCoupons.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
            <TicketPercent size={42} className="text-gray-300" />
            <h3 className="mt-3 font-semibold">
              No coupons found
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Create a coupon or change your search filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-sm">

              <thead className="bg-[#F8F7F3] text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-4">Coupon</th>
                  <th className="px-5 py-4">Discount</th>
                  <th className="px-5 py-4">Min. Order</th>
                  <th className="px-5 py-4">Usage</th>
                  <th className="px-5 py-4">Expiry Date</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {filteredCoupons.map((coupon) => {
                  const status = getCouponStatus(coupon);

                  return (
                    <tr
                      key={coupon.id}
                      className="transition hover:bg-gray-50"
                    >
                      <td className="px-5 py-4">
                        <p className="font-bold tracking-wide">
                          {coupon.code}
                        </p>
                        <p className="mt-1 max-w-48 truncate text-xs text-gray-500">
                          {coupon.description || "No description"}
                        </p>
                      </td>

                      <td className="px-5 py-4 font-semibold">
                        {coupon.discount_type === "percentage"
                          ? `${coupon.discount_value}% OFF`
                          : `${formatMoney(coupon.discount_value)} OFF`}
                      </td>

                      <td className="px-5 py-4">
                        {formatMoney(coupon.min_order_amount)}
                      </td>

                      <td className="px-5 py-4">
                        <span className="font-semibold">
                          {coupon.usage_count}
                        </span>
                        <span className="text-gray-400">
                          {" "}/{" "}
                          {coupon.max_uses ?? "Unlimited"}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-gray-600">
                        {formatDate(coupon.expiry_date)}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            status === "Active"
                              ? "bg-green-100 text-green-700"
                              : status === "Expired" ||
                                status === "Limit reached"
                              ? "bg-red-100 text-red-700"
                              : status === "Scheduled"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {status}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">

                          <button
                            onClick={() => openEditModal(coupon)}
                            title="Edit coupon"
                            className="rounded-lg border border-gray-200 p-2 text-gray-600 transition hover:border-[#B3944D] hover:text-[#B3944D]"
                          >
                            <Pencil size={16} />
                          </button>

                          <button
                            onClick={() => toggleStatus(coupon)}
                            title={coupon.is_active ? "Deactivate" : "Activate"}
                            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                              coupon.is_active
                                ? "border-orange-200 text-orange-600 hover:bg-orange-50"
                                : "border-green-200 text-green-600 hover:bg-green-50"
                            }`}
                          >
                            {coupon.is_active ? "Deactivate" : "Activate"}
                          </button>

                          <button
                            onClick={() => deleteCoupon(coupon)}
                            title="Delete coupon"
                            className="rounded-lg border border-red-100 p-2 text-red-500 transition hover:bg-red-50"
                          >
                            <Trash2 size={16} />
                          </button>

                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}

      {showModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 sm:p-5"
          onClick={closeModal}
        >
          <div
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4 sm:px-7">
              <div>
                <h2 className="text-xl font-bold">
                  {editingCoupon ? "Edit Coupon" : "Create Coupon"}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Configure your discount coupon.
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-5 sm:p-7">

              {error && (
                <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              {/* BASIC INFORMATION */}

              <div>
                <h3 className="mb-3 text-sm font-bold text-[#B3944D]">
                  COUPON INFORMATION
                </h3>

                <div className="grid gap-4 sm:grid-cols-2">

                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-semibold">
                      Coupon Code *
                    </label>
                    <input
                      required
                      minLength={3}
                      maxLength={50}
                      disabled={!!editingCoupon}
                      value={form.code}
                      onChange={(e) =>
                        handleChange("code", e.target.value.toUpperCase())
                      }
                      placeholder="e.g. GMART20"
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold uppercase outline-none focus:border-[#B3944D] disabled:bg-gray-100"
                    />
                    {editingCoupon && (
                      <p className="mt-1 text-xs text-gray-400">
                        Coupon codes cannot be changed while editing.
                      </p>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-semibold">
                      Description
                    </label>
                    <textarea
                      rows={2}
                      value={form.description}
                      onChange={(e) =>
                        handleChange("description", e.target.value)
                      }
                      placeholder="Describe this coupon..."
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#B3944D]"
                    />
                  </div>
                </div>
              </div>

              {/* DISCOUNT INFORMATION */}

              <div>
                <h3 className="mb-3 text-sm font-bold text-[#B3944D]">
                  DISCOUNT SETTINGS
                </h3>

                <div className="grid gap-4 sm:grid-cols-2">

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">
                      Discount Type *
                    </label>
                    <select
                      value={form.discount_type}
                      onChange={(e) =>
                        handleChange(
                          "discount_type",
                          e.target.value as "percentage" | "fixed"
                        )
                      }
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#B3944D]"
                    >
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed">Fixed Amount (₹)</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">
                      Discount Value *
                    </label>
                    <input
                      required
                      type="number"
                      min="0.01"
                      max={form.discount_type === "percentage" ? 100 : undefined}
                      step="0.01"
                      value={form.discount_value}
                      onChange={(e) =>
                        handleChange("discount_value", e.target.value)
                      }
                      placeholder={
                        form.discount_type === "percentage" ? "20" : "50"
                      }
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#B3944D]"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">
                      Minimum Order Amount (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.min_order_amount}
                      onChange={(e) =>
                        handleChange("min_order_amount", e.target.value)
                      }
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#B3944D]"
                    />
                  </div>

                  {form.discount_type === "percentage" && (
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold">
                        Maximum Discount (₹)
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={form.max_discount_amount}
                        onChange={(e) =>
                          handleChange("max_discount_amount", e.target.value)
                        }
                        placeholder="Optional"
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#B3944D]"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* VALIDITY */}

              <div>
                <h3 className="mb-3 text-sm font-bold text-[#B3944D]">
                  VALIDITY & USAGE
                </h3>

                <div className="grid gap-4 sm:grid-cols-2">

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">
                      Start Date *
                    </label>
                    <input
                      required
                      type="datetime-local"
                      value={form.start_date}
                      onChange={(e) =>
                        handleChange("start_date", e.target.value)
                      }
                      className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:border-[#B3944D]"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">
                      Expiry Date *
                    </label>
                    <input
                      required
                      type="datetime-local"
                      value={form.expiry_date}
                      onChange={(e) =>
                        handleChange("expiry_date", e.target.value)
                      }
                      className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:border-[#B3944D]"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">
                      Maximum Uses
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={form.max_uses}
                      onChange={(e) =>
                        handleChange("max_uses", e.target.value)
                      }
                      placeholder="Unlimited"
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#B3944D]"
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      Leave empty for unlimited usage.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3">
                    <input
                      id="coupon-active"
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) =>
                        handleChange("is_active", e.target.checked)
                      }
                      className="h-4 w-4 accent-[#B3944D]"
                    />
                    <label
                      htmlFor="coupon-active"
                      className="text-sm font-semibold"
                    >
                      Coupon is active
                    </label>
                  </div>
                </div>
              </div>

              {/* ACTIONS */}

              <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#101B2D] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#1C2B42] disabled:opacity-60"
                >
                  {saving
                    ? "Saving..."
                    : editingCoupon
                    ? "Save Changes"
                    : "Create Coupon"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Coupons;
