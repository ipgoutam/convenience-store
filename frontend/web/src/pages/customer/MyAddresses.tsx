import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import api from "../../services/api";
import type { Address, AddressFormData } from "../../types/address";
import { emptyAddressForm } from "../../types/address";

function getErrorMessage(error: unknown): string {
  const apiError = error as {
    response?: {
      data?: {
        detail?: string | { msg?: string }[];
      };
    };
  };

  const detail = apiError.response?.data?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || "Invalid input").join(", ");
  }

  return "Something went wrong. Please try again.";
}

function MyAddresses() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AddressFormData>(emptyAddressForm);

  const fetchAddresses = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get<Address[]>("/addresses/");
      setAddresses(response.data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAddresses();
  }, []);

  const openAddForm = () => {
    setEditingId(null);
    setForm({
      ...emptyAddressForm,
      is_default: addresses.length === 0,
    });
    setError("");
    setSuccess("");
    setFormOpen(true);
  };

  const openEditForm = (address: Address) => {
    setEditingId(address.id);

    setForm({
      label: address.label,
      recipient_name: address.recipient_name,
      phone: address.phone,
      address_line: address.address_line,
      landmark: address.landmark || "",
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      is_default: address.is_default,
    });

    setError("");
    setSuccess("");
    setFormOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!/^[0-9]{10}$/.test(form.phone.trim())) {
      setError("Please enter a valid 10-digit phone number.");
      return;
    }

    if (!/^[0-9]{6}$/.test(form.pincode.trim())) {
      setError("Please enter a valid 6-digit PIN code.");
      return;
    }

    const payload = {
      ...form,
      label: form.label.trim(),
      recipient_name: form.recipient_name.trim(),
      phone: form.phone.trim(),
      address_line: form.address_line.trim(),
      landmark: form.landmark.trim() || null,
      city: form.city.trim(),
      state: form.state.trim(),
      pincode: form.pincode.trim(),
    };

    try {
      setSaving(true);

      if (editingId !== null) {
        await api.put(`/addresses/${editingId}`, payload);
        setSuccess("Address updated successfully.");
      } else {
        await api.post("/addresses/", payload);
        setSuccess("Address added successfully.");
      }

      setFormOpen(false);
      setEditingId(null);
      setForm(emptyAddressForm);

      await fetchAddresses();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (addressId: number) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this address?"
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      await api.delete(`/addresses/${addressId}`);
      setSuccess("Address deleted successfully.");
      await fetchAddresses();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleSetDefault = async (addressId: number) => {
    setError("");
    setSuccess("");

    try {
      await api.patch(`/addresses/${addressId}/default`);
      setSuccess("Default address updated.");
      await fetchAddresses();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const inputClass =
    "w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#101B2D] outline-none transition focus:border-[#D6B875] focus:ring-2 focus:ring-[#D6B875]/20";

  return (
    <div className="min-h-screen bg-[#F7F5EF] px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              to="/my-profile"
              className="text-sm font-medium text-[#8A6D25] hover:underline"
            >
              ← Back to My Profile
            </Link>

            <h1 className="mt-3 text-3xl font-bold text-[#101B2D]">
              My Addresses
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Manage your saved delivery addresses.
            </p>
          </div>

          <button
            type="button"
            onClick={openAddForm}
            className="rounded-lg bg-[#101B2D] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1C2B42]"
          >
            + Add New Address
          </button>
        </div>

        {error && (
          <div className="mb-5 rounded-lg bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-5 rounded-lg bg-green-50 p-4 text-sm text-green-700">
            {success}
          </div>
        )}

        {formOpen && (
          <section className="mb-8 rounded-2xl bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-[#101B2D]">
                {editingId !== null ? "Edit Address" : "Add New Address"}
              </h2>

              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="text-sm text-gray-500 hover:text-red-600"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#101B2D]">
                  Address Label
                </label>

                <select
                  value={form.label}
                  onChange={(event) =>
                    setForm({ ...form, label: event.target.value })
                  }
                  className={inputClass}
                >
                  <option value="Home">Home</option>
                  <option value="Work">Work</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#101B2D]">
                    Recipient Name *
                  </label>
                  <input
                    required
                    value={form.recipient_name}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        recipient_name: event.target.value,
                      })
                    }
                    className={inputClass}
                    placeholder="Full name"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-[#101B2D]">
                    Phone Number *
                  </label>
                  <input
                    required
                    type="tel"
                    maxLength={10}
                    value={form.phone}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        phone: event.target.value.replace(/\D/g, "").slice(0, 10),
                      })
                    }
                    className={inputClass}
                    placeholder="10-digit phone number"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#101B2D]">
                  Full Address *
                </label>
                <textarea
                  required
                  rows={3}
                  value={form.address_line}
                  onChange={(event) =>
                    setForm({ ...form, address_line: event.target.value })
                  }
                  className={inputClass}
                  placeholder="House number, street, area"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#101B2D]">
                  Landmark
                </label>
                <input
                  value={form.landmark}
                  onChange={(event) =>
                    setForm({ ...form, landmark: event.target.value })
                  }
                  className={inputClass}
                  placeholder="Nearby landmark (optional)"
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#101B2D]">
                    City *
                  </label>
                  <input
                    required
                    value={form.city}
                    onChange={(event) =>
                      setForm({ ...form, city: event.target.value })
                    }
                    className={inputClass}
                    placeholder="City"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-[#101B2D]">
                    State *
                  </label>
                  <input
                    required
                    value={form.state}
                    onChange={(event) =>
                      setForm({ ...form, state: event.target.value })
                    }
                    className={inputClass}
                    placeholder="State"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#101B2D]">
                  PIN Code *
                </label>
                <input
                  required
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={form.pincode}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      pincode: event.target.value.replace(/\D/g, "").slice(0, 6),
                    })
                  }
                  className={inputClass}
                  placeholder="6-digit PIN code"
                />
              </div>

              <label className="flex cursor-pointer items-center gap-3 text-sm text-[#101B2D]">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={(event) =>
                    setForm({ ...form, is_default: event.target.checked })
                  }
                  className="h-4 w-4 accent-[#101B2D]"
                />
                Set as my default address
              </label>

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-[#101B2D] px-5 py-3 font-semibold text-white transition hover:bg-[#1C2B42] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {saving
                  ? "Saving..."
                  : editingId !== null
                    ? "Update Address"
                    : "Save Address"}
              </button>
            </form>
          </section>
        )}

        {loading ? (
          <div className="rounded-xl bg-white p-8 text-center text-gray-500">
            Loading your addresses...
          </div>
        ) : addresses.length === 0 ? (
          <div className="rounded-2xl bg-white px-6 py-12 text-center shadow-sm">
            <div className="text-4xl">📍</div>
            <h2 className="mt-4 text-xl font-bold text-[#101B2D]">
              No saved addresses
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Add an address to make your next checkout faster.
            </p>
            <button
              type="button"
              onClick={openAddForm}
              className="mt-6 rounded-lg bg-[#101B2D] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1C2B42]"
            >
              Add Your First Address
            </button>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {addresses.map((address) => (
              <article
                key={address.id}
                className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-[#101B2D]">
                        {address.label}
                      </h2>

                      {address.is_default && (
                        <span className="rounded-full bg-[#D6B875]/20 px-3 py-1 text-xs font-semibold text-[#80621C]">
                          Default
                        </span>
                      )}
                    </div>

                    <p className="mt-3 font-semibold text-[#101B2D]">
                      {address.recipient_name}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      {address.phone}
                    </p>
                  </div>

                  <span className="text-2xl">📍</span>
                </div>

                <p className="mt-4 text-sm leading-6 text-gray-600">
                  {address.address_line}
                  {address.landmark ? `, ${address.landmark}` : ""}
                  {`, ${address.city}, ${address.state} - ${address.pincode}`}
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
                  <button
                    type="button"
                    onClick={() => openEditForm(address)}
                    className="text-sm font-semibold text-[#80621C] hover:underline"
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(address.id)}
                    className="text-sm font-semibold text-red-600 hover:underline"
                  >
                    Delete
                  </button>

                  {!address.is_default && (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(address.id)}
                      className="ml-auto text-sm font-semibold text-[#101B2D] hover:underline"
                    >
                      Set as Default
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default MyAddresses;