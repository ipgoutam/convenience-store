import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import type { Address } from "../../types/address";

interface ProfileForm {
  full_name: string;
  phone: string;
}

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

function MyProfile() {
  const { user, updateUser } = useAuth();

  const [profile, setProfile] = useState<ProfileForm>({
    full_name: user?.full_name || "",
    phone: user?.phone || "",
  });

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setProfile({
        full_name: user.full_name || "",
        phone: user.phone || "",
      });
    }
  }, [user]);

  useEffect(() => {
    const fetchAddresses = async () => {
      try {
        const response = await api.get<Address[]>("/addresses/");
        setAddresses(response.data);
      } catch {
        // The address page provides the full error handling.
      }
    };

    fetchAddresses();
  }, []);

  const handleProfileSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setProfileError("");
    setProfileMessage("");

    if (!profile.full_name.trim()) {
      setProfileError("Please enter your full name.");
      return;
    }

    if (
      profile.phone.trim() &&
      !/^[0-9]{10}$/.test(profile.phone.trim())
    ) {
      setProfileError("Please enter a valid 10-digit phone number.");
      return;
    }

    try {
      setProfileSaving(true);

      const payload: { full_name: string; phone?: string } = {
        full_name: profile.full_name.trim(),
      };

      if (profile.phone.trim()) {
        payload.phone = profile.phone.trim();
      }

      const response = await api.put("/auth/me", payload);

      updateUser(response.data);
      setProfileMessage("Your profile has been updated successfully.");
    } catch (err) {
      setProfileError(getErrorMessage(err));
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setPasswordError("");
    setPasswordMessage("");

    if (newPassword.length < 8) {
      setPasswordError("Your new password must contain at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirm password do not match.");
      return;
    }

    if (oldPassword === newPassword) {
      setPasswordError("Your new password must be different from the old password.");
      return;
    }

    try {
      setPasswordSaving(true);

      await api.patch("/auth/change-password", {
        old_password: oldPassword,
        new_password: newPassword,
      });

      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setPasswordMessage("Your password has been changed successfully.");
    } catch (err) {
      setPasswordError(getErrorMessage(err));
    } finally {
      setPasswordSaving(false);
    }
  };

  const defaultAddress = addresses.find((address) => address.is_default);

  const inputClass =
    "w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#101B2D] outline-none transition focus:border-[#D6B875] focus:ring-2 focus:ring-[#D6B875]/20";

  return (
    <div className="min-h-screen bg-[#F7F5EF] px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#101B2D]">
            My Profile
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Manage your personal information, password, and addresses.
          </p>
        </div>

        {/* Personal Information */}
        <section className="mb-7 rounded-2xl bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-[#101B2D]">
              Personal Information
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Update the information associated with your account.
            </p>
          </div>

          {profileError && (
            <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {profileError}
            </p>
          )}

          {profileMessage && (
            <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
              {profileMessage}
            </p>
          )}

          <form onSubmit={handleProfileSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#101B2D]">
                Full Name
              </label>
              <input
                required
                value={profile.full_name}
                onChange={(event) =>
                  setProfile({
                    ...profile,
                    full_name: event.target.value,
                  })
                }
                className={inputClass}
                placeholder="Your full name"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#101B2D]">
                Email Address
              </label>
              <input
                value={user?.email || ""}
                readOnly
                className={`${inputClass} cursor-not-allowed bg-gray-100 text-gray-500`}
              />
              <p className="mt-1 text-xs text-gray-400">
                Your email address cannot be changed here.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#101B2D]">
                Phone Number
              </label>
              <input
                type="tel"
                maxLength={10}
                value={profile.phone}
                onChange={(event) =>
                  setProfile({
                    ...profile,
                    phone: event.target.value.replace(/\D/g, "").slice(0, 10),
                  })
                }
                className={inputClass}
                placeholder="10-digit phone number"
              />
            </div>

            <button
              type="submit"
              disabled={profileSaving}
              className="rounded-lg bg-[#101B2D] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#1C2B42] disabled:opacity-60"
            >
              {profileSaving ? "Saving..." : "Save Changes"}
            </button>
          </form>
        </section>

        {/* Change Password */}
        <section className="mb-7 rounded-2xl bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-[#101B2D]">
              Change Password
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Choose a new password with at least 8 characters.
            </p>
          </div>

          {passwordError && (
            <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {passwordError}
            </p>
          )}

          {passwordMessage && (
            <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
              {passwordMessage}
            </p>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-5">
            <div>
                <label className="mb-2 block text-sm font-medium text-[#101B2D]">
                    Current Password
                </label>

                <div className="relative">
                    <input
                    required
                    type={showOldPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={oldPassword}
                    onChange={(event) => setOldPassword(event.target.value)}
                    className={`${inputClass} pr-16`}
                    placeholder="Enter current password"
                    />

                    <button
                    type="button"
                    onClick={() => setShowOldPassword(!showOldPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500 hover:text-[#101B2D]"
                    >
                    {showOldPassword ? "Hide" : "Show"}
                    </button>
                </div>
                </div>

                <div>
                <label className="mb-2 block text-sm font-medium text-[#101B2D]">
                    New Password
                </label>

                <div className="relative">
                    <input
                    required
                    type={showNewPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className={`${inputClass} pr-16`}
                    placeholder="Enter new password"
                    />

                    <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500 hover:text-[#101B2D]"
                    >
                    {showNewPassword ? "Hide" : "Show"}
                    </button>
                </div>
                </div>

                <div>
                <label className="mb-2 block text-sm font-medium text-[#101B2D]">
                    Confirm New Password
                </label>

                <div className="relative">
                    <input
                    required
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className={`${inputClass} pr-16`}
                    placeholder="Re-enter new password"
                    />

                    <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500 hover:text-[#101B2D]"
                    >
                    {showConfirmPassword ? "Hide" : "Show"}
                    </button>
                </div>
                </div>

            <button
              type="submit"
              disabled={passwordSaving}
              className="rounded-lg bg-[#101B2D] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#1C2B42] disabled:opacity-60"
            >
              {passwordSaving ? "Updating..." : "Change Password"}
            </button>
          </form>
        </section>

        {/* Address Summary */}
        <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-[#101B2D]">
                My Addresses
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {addresses.length} saved{" "}
                {addresses.length === 1 ? "address" : "addresses"}
              </p>
            </div>

            <Link
              to="/my-addresses"
              className="rounded-lg border border-[#D6B875] px-4 py-2.5 text-sm font-semibold text-[#80621C] transition hover:bg-[#D6B875]/10"
            >
              Manage Addresses →
            </Link>
          </div>

          {defaultAddress ? (
            <div className="mt-5 rounded-xl border border-[#D6B875]/50 bg-[#F7F5EF] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-[#101B2D]">
                  {defaultAddress.label}
                </span>
                <span className="rounded-full bg-[#D6B875]/30 px-3 py-1 text-xs font-semibold text-[#80621C]">
                  Default Address
                </span>
              </div>

              <p className="mt-2 text-sm font-medium text-[#101B2D]">
                {defaultAddress.recipient_name} · {defaultAddress.phone}
              </p>

              <p className="mt-1 text-sm leading-6 text-gray-600">
                {defaultAddress.address_line}
                {defaultAddress.landmark
                  ? `, ${defaultAddress.landmark}`
                  : ""}
                {`, ${defaultAddress.city}, ${defaultAddress.state} - ${defaultAddress.pincode}`}
              </p>
            </div>
          ) : (
            <div className="mt-5 rounded-xl bg-[#F7F5EF] p-5 text-center">
              <p className="text-sm text-gray-600">
                You haven't added a delivery address yet.
              </p>
              <Link
                to="/my-addresses"
                className="mt-3 inline-block text-sm font-semibold text-[#80621C] hover:underline"
              >
                Add an address →
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default MyProfile;