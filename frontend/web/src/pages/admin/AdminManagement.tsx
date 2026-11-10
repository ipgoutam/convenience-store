
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Search,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Users,
  Copy,
  Check,
  X,
} from "lucide-react";

import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";

interface AdminAccount {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  section_permissions: Record<string, boolean>;
}

interface InviteResponse {
  email: string;
  invitation_token: string;
  expires_in_hours: number;
}

const ADMIN_SECTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "products", label: "Products" },
  { key: "inventory", label: "Inventory" },
  { key: "orders", label: "Orders" },
  { key: "settings", label: "Store Settings" },
  { key: "categories", label: "Categories" },
  { key: "homepage", label: "Homepage Management" },
  { key: "customers", label: "Customers" },
  { key: "coupons", label: "Coupons" },
  { key: "notifications", label: "Notifications" },
];

function AdminManagement() {
  const { user } = useAuth();

  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [selectedAdmin, setSelectedAdmin] =
  useState<AdminAccount | null>(null);

  const [permissionDraft, setPermissionDraft] =
    useState<Record<string, boolean>>({});

  const [permissionSaving, setPermissionSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] =
    useState<InviteResponse | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isSuperAdmin = user?.role === "super_admin";
  const invitationLink = inviteResult
    ? `${window.location.origin}/admin/register?token=${encodeURIComponent(
        inviteResult.invitation_token
        )}`
    : "";
  const loadAdmins = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get<AdminAccount[]>(
        "/admin/management/admins"
      );

      setAdmins(response.data);
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          "Could not load administrator accounts."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      loadAdmins();
    } else {
      setLoading(false);
    }
  }, [isSuperAdmin, loadAdmins]);

  const createInvitation = async (e: FormEvent) => {
    e.preventDefault();

    if (!inviteEmail.trim()) {
      setError("Please enter an email address.");
      return;
    }

    setInviteLoading(true);
    setError("");
    setSuccess("");
    setInviteResult(null);

    try {
      const response = await api.post<InviteResponse>(
        "/admin/management/invites",
        {
          email: inviteEmail.trim().toLowerCase(),
        }
      );

      setInviteResult(response.data);
      setSuccess("Admin invitation created successfully.");
      setInviteEmail("");
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          "Could not create admin invitation."
      );
    } finally {
      setInviteLoading(false);
    }
  };

const copyInvitationToken = async () => {
  if (!inviteResult?.invitation_token) return;

  try {
    await navigator.clipboard.writeText(
      inviteResult.invitation_token
    );
    setCopiedToken(true);
  } catch {
    setError("Could not copy the invitation token.");
  }
};

    const copyInvitationLink = async () => {
    if (!invitationLink) return;

    try {
        await navigator.clipboard.writeText(invitationLink);
        setCopiedLink(true);
    } catch {
        setError("Could not copy the invitation link.");
    }
    };

  const toggleAdminStatus = async (admin: AdminAccount) => {
    if (admin.id === user?.id) {
      setError("You cannot change your own account status.");
      return;
    }

    const action = admin.is_active ? "deactivate" : "activate";

    const confirmed = window.confirm(
      `Are you sure you want to ${action} ${admin.full_name}?`
    );

    if (!confirmed) return;

    setUpdatingId(admin.id);
    setError("");
    setSuccess("");

    try {
      await api.patch(
        `/admin/management/admins/${admin.id}/${action}`
      );

      setSuccess(
        `${admin.full_name} has been ${action}d successfully.`
      );

      await loadAdmins();
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          `Could not ${action} administrator.`
      );
    } finally {
      setUpdatingId(null);
    }
  };
  
  const openPermissionModal = (admin: AdminAccount) => {
  setSelectedAdmin(admin);

  const permissions = Object.fromEntries(
    ADMIN_SECTIONS.map((section) => [
      section.key,
      admin.section_permissions?.[section.key] ?? false,
    ])
  );

  setPermissionDraft(permissions);
  setError("");
  setSuccess("");
};

const saveAdminPermissions = async () => {
  if (!selectedAdmin) return;

  setPermissionSaving(true);
  setError("");
  setSuccess("");

  try {
    await api.patch(
      `/admin/management/admins/${selectedAdmin.id}/permissions`,
      permissionDraft
    );

    setSuccess(
      `Permissions updated successfully for ${selectedAdmin.full_name}.`
    );

    setSelectedAdmin(null);
    await loadAdmins();
  } catch (err: any) {
    setError(
      err.response?.data?.detail ||
        "Could not update admin permissions."
    );
  } finally {
    setPermissionSaving(false);
  }
};

   const closeInviteModal = () => {
    setShowInviteModal(false);
    setInviteEmail("");
    setInviteResult(null);
    setCopiedToken(false);
    setCopiedLink(false);
    setError("");
    };

  const filteredAdmins = admins.filter((admin) => {
    const searchText = search.trim().toLowerCase();

    const matchesSearch =
      !searchText ||
      admin.full_name.toLowerCase().includes(searchText) ||
      admin.email.toLowerCase().includes(searchText) ||
      (admin.phone || "").includes(searchText);

    const matchesStatus =
      statusFilter === "" ||
      (statusFilter === "active" && admin.is_active) ||
      (statusFilter === "inactive" && !admin.is_active);

    return matchesSearch && matchesStatus;
  });

  const totalAdmins = admins.length;
  const activeAdmins = admins.filter((admin) => admin.is_active).length;
  const inactiveAdmins = totalAdmins - activeAdmins;

  if (!isSuperAdmin) {
    return (
      <div className="rounded-xl border border-red-100 bg-white p-10 text-center shadow-sm">
        <ShieldCheck className="mx-auto h-12 w-12 text-red-500" />

        <h2 className="mt-4 text-xl font-bold text-[#101B2D]">
          Access denied
        </h2>

        <p className="mt-2 text-sm text-gray-500">
          Only the Super Admin can manage administrator accounts.
        </p>
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
              Admin Management
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Manage administrator accounts and invite new admins.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadAdmins}
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw size={16} />
              Refresh
            </button>

            <button
              type="button"
              onClick={() => {
                setError("");
                setSuccess("");
                setShowInviteModal(true);
              }}
              className="flex items-center justify-center gap-2 rounded-lg bg-[#101B2D] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1C2B42]"
            >
              <UserPlus size={17} />
              Invite Admin
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              className="ml-3 font-bold"
            >
              <X size={17} />
            </button>
          </div>
        )}

        {success && (
          <div className="mb-5 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <span>{success}</span>
            <button
              type="button"
              onClick={() => setSuccess("")}
              className="ml-3 font-bold"
            >
              <X size={17} />
            </button>
          </div>
        )}

        {/* Summary cards */}
        <div className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            {
              label: "Total Admins",
              value: totalAdmins,
              icon: Users,
              color: "bg-blue-50 text-blue-700",
            },
            {
              label: "Active Admins",
              value: activeAdmins,
              icon: ShieldCheck,
              color: "bg-green-50 text-green-700",
            },
            {
              label: "Inactive Admins",
              value: inactiveAdmins,
              icon: X,
              color: "bg-red-50 text-red-700",
            },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.label}
                className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">{item.label}</p>

                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.color}`}
                  >
                    <Icon size={20} />
                  </span>
                </div>

                <p className="mt-3 text-2xl font-bold text-[#101B2D]">
                  {item.value}
                </p>
              </div>
            );
          })}
        </div>

        {/* Search and filter */}
        <div className="mb-6 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-[#101B2D]">
            Find Administrators
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-600">
                Search
              </label>

              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />

                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email or phone..."
                  className="form-input pl-10"
                />
              </div>
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
                <option value="">All Administrators</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        {/* Admin table */}
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-2 border-b border-gray-100 p-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-bold text-[#101B2D]">
                Administrator Accounts
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                View and manage G-MART administrators.
              </p>
            </div>

            <span className="text-sm text-gray-500">
              {filteredAdmins.length} administrators found
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-500">
              Loading administrators...
            </div>
          ) : filteredAdmins.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="mx-auto h-10 w-10 text-gray-300" />

              <h3 className="mt-3 font-semibold text-gray-700">
                No administrators found
              </h3>

              <p className="mt-1 text-sm text-gray-500">
                Try changing your search or filters.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-5 py-4">Administrator</th>
                    <th className="px-5 py-4">Contact</th>
                    <th className="px-5 py-4">Role</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {filteredAdmins.map((admin) => (
                    <tr
                      key={admin.id}
                      className="transition hover:bg-gray-50"
                    >
                      <td className="px-5 py-4">
                        <p className="font-semibold text-[#101B2D]">
                          {admin.full_name}
                        </p>

                        <p className="mt-1 text-xs text-gray-400">
                          Admin ID: #{admin.id}
                          {admin.id === user?.id && " • You"}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <p className="text-gray-700">{admin.email}</p>

                        <p className="mt-1 text-xs text-gray-500">
                          {admin.phone || "No phone number"}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                            admin.role === "super_admin"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {admin.role.replace(/_/g, " ")}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                            admin.is_active
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {admin.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          {admin.role === "admin" && (
                            <button
                              type="button"
                              onClick={() => openPermissionModal(admin)}
                              className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                            >
                              Manage Permissions
                            </button>
                          )}

                          {admin.id === user?.id ? (
                            <span className="text-xs text-gray-400">
                              Current account
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={updatingId === admin.id}
                              onClick={() => toggleAdminStatus(admin)}
                              className={`rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${
                                admin.is_active
                                  ? "bg-red-50 text-red-700 hover:bg-red-100"
                                  : "bg-green-50 text-green-700 hover:bg-green-100"
                              }`}
                            >
                              {updatingId === admin.id
                                ? "Updating..."
                                : admin.is_active
                                  ? "Deactivate"
                                  : "Activate"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {/* Admin Permissions Modal */}
      {selectedAdmin && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-3 sm:p-6">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#B3944D]">
                  ADMIN ACCESS CONTROL
                </p>

                <h2 className="mt-1 text-xl font-bold text-[#101B2D]">
                  Manage Permissions
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  {selectedAdmin.full_name} ({selectedAdmin.email})
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedAdmin(null)}
                className="rounded-lg bg-gray-100 p-2 text-gray-600 hover:bg-gray-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {ADMIN_SECTIONS.map((section) => (
                <div
                  key={section.key}
                  className="flex items-center justify-between rounded-lg border border-gray-100 p-4"
                >
                  <span className="text-sm font-semibold text-gray-700">
                    {section.label}
                  </span>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={permissionDraft[section.key] ?? false}
                    onClick={() =>
                      setPermissionDraft((previous) => ({
                        ...previous,
                        [section.key]: !previous[section.key],
                      }))
                    }
                    className={`relative h-6 w-11 rounded-full transition ${
                      permissionDraft[section.key]
                        ? "bg-green-600"
                        : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${
                        permissionDraft[section.key]
                          ? "left-6"
                          : "left-1"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedAdmin(null)}
                disabled={permissionSaving}
                className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveAdminPermissions}
                disabled={permissionSaving}
                className="rounded-lg bg-[#101B2D] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1C2B42] disabled:opacity-50"
              >
                {permissionSaving ? "Saving..." : "Save Permissions"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Invite admin modal */}
      {showInviteModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 sm:p-6"
          onClick={closeInviteModal}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#B3944D]">
                  ADMINISTRATION
                </p>

                <h2 className="mt-1 text-xl font-bold text-[#101B2D]">
                  Invite New Admin
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Create a secure invitation for a new administrator.
                </p>
              </div>

              <button
                type="button"
                onClick={closeInviteModal}
                className="rounded-lg bg-gray-100 p-2 text-gray-600 hover:bg-gray-200"
              >
                <X size={18} />
              </button>
            </div>

            {!inviteResult ? (
            <>
                {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
                )}

                <form onSubmit={createInvitation}>
                <label className="mb-1.5 block text-sm font-medium text-gray-600">
                    Admin Email Address
                </label>

                <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="admin@example.com"
                    className="form-input"
                />

                <p className="mt-2 text-xs text-gray-400">
                    The invitation will expire after 48 hours.
                </p>

                <div className="mt-6 flex justify-end gap-3">
                    <button
                    type="button"
                    onClick={closeInviteModal}
                    className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                    >
                    Cancel
                    </button>

                    <button
                    type="submit"
                    disabled={inviteLoading}
                    className="rounded-lg bg-[#101B2D] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1C2B42] disabled:opacity-50"
                    >
                    {inviteLoading ? "Creating..." : "Create Invitation"}
                    </button>
                </div>
                </form>
            </>
            ) : (
            <div>
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-green-700">
                    <Check size={18} />
                    Invitation created successfully
                </div>

                <p className="mt-2 text-sm text-green-700">
                    Invitation for {inviteResult.email}
                </p>

                <p className="mt-1 text-xs text-green-700">
                    Expires in {inviteResult.expires_in_hours} hours.
                </p>
                </div>

                <label className="mb-2 mt-5 block text-sm font-semibold text-gray-700">
                Invitation Token
                </label>

                <textarea
                readOnly
                value={inviteResult.invitation_token}
                rows={3}
                className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700"
                />

                <button
                type="button"
                onClick={copyInvitationToken}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-[#101B2D] hover:bg-gray-50"
                >
                {copiedToken ? <Check size={17} /> : <Copy size={17} />}
                {copiedToken ? "Copied" : "Copy Invitation Token"}
                </button>
                <label className="mb-2 mt-5 block text-sm font-semibold text-gray-700">
                    Admin Registration Link
                    </label>

                    <textarea
                    readOnly
                    value={invitationLink}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700"
                    />

                    <button
                    type="button"
                    onClick={copyInvitationLink}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800"
                    >
                    {copiedLink ? <Check size={17} /> : <Copy size={17} />}
                    {copiedLink ? "Invitation Link Copied" : "Copy Invitation Link"}
                    </button>

                <p className="mt-3 text-xs text-gray-500">
                Share this token securely with the invited person.
                They will need it to complete their admin registration.
                </p>

                <button
                type="button"
                onClick={closeInviteModal}
                className="mt-5 w-full rounded-lg bg-[#101B2D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1C2B42]"
                >
                Done
                </button>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminManagement;
