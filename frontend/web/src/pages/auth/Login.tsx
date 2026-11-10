
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, ArrowLeft, CheckCircle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";

type PageMode = "login" | "forgot" | "verify" | "reset";

function getErrorMessage(err: unknown): string {
  const error = err as {
    response?: {
      data?: {
        detail?: string | { msg?: string }[];
      };
    };
  };

  const detail = error.response?.data?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || "Invalid input").join(", ");
  }

  return "Something went wrong. Please try again.";
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  // Login state
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Forgot password state
  const [mode, setMode] = useState<PageMode>("login");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [success, setSuccess] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  // --------------------------------------------------
  // LOGIN
  // --------------------------------------------------

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    clearMessages();
    setSubmitting(true);

    try {
      const user = await login(identifier, password);

      if (["admin", "super_admin"].includes(user.role)) {
        navigate("/admin/products");
      } else {
        navigate("/");
      }
    } catch (err) {
      setError(
        getErrorMessage(err) || "Unable to log in. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // --------------------------------------------------
  // REQUEST OTP
  // --------------------------------------------------

  const handleForgotPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    clearMessages();

    try {
      setResetLoading(true);

      await api.post("/auth/forgot-password", {
        email: email.trim().toLowerCase(),
      });

      setMode("verify");
      setSuccess("If an account exists with this email, a reset OTP has been sent.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setResetLoading(false);
    }
  };

  // --------------------------------------------------
  // VERIFY OTP
  // --------------------------------------------------

  const handleVerifyOTP = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    clearMessages();

    if (!/^[0-9]{6}$/.test(otp)) {
      setError("Please enter a valid six-digit OTP.");
      return;
    }

    try {
      setResetLoading(true);

      await api.post("/auth/verify-reset-otp", {
        email: email.trim().toLowerCase(),
        otp,
      });

      setMode("reset");
      setSuccess("OTP verified successfully. You can now create a new password.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setResetLoading(false);
    }
  };

  // --------------------------------------------------
  // RESET PASSWORD
  // --------------------------------------------------

  const handleResetPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    clearMessages();

    if (newPassword.length < 8) {
      setError("Your password must contain at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }

    try {
      setResetLoading(true);

      await api.post("/auth/reset-password", {
        email: email.trim().toLowerCase(),
        otp,
        new_password: newPassword,
      });

      setPassword("");
      setIdentifier(email.trim().toLowerCase());
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");

      setMode("login");
      setSuccess(
        "Password reset successfully! Please sign in using your new password."
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setResetLoading(false);
    }
  };

  // --------------------------------------------------
  // COMMON STYLES
  // --------------------------------------------------

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-[#101B2D] outline-none transition focus:border-[#D6B875] focus:ring-2 focus:ring-[#D6B875]/20";

  const buttonClass =
    "w-full rounded-lg bg-[#101B2D] py-3 font-semibold text-white transition hover:bg-[#1C2B42] disabled:cursor-not-allowed disabled:opacity-50";

  // --------------------------------------------------
  // PAGE
  // --------------------------------------------------

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F5EF] px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">

        {/* Logo */}
        <Link to="/" className="text-3xl font-black text-[#101B2D]">
          G-MART
        </Link>

        {/* LOGIN PAGE */}
        {mode === "login" && (
          <>
            <h1 className="mt-6 text-2xl font-bold text-[#101B2D]">
              Welcome Back
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Sign in to continue shopping or manage your store.
            </p>

            {success && (
              <div className="mt-5 flex items-start gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
                <CheckCircle size={18} className="mt-0.5 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#101B2D]">
                  Email / Phone Number
                </label>

                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  className={inputClass}
                  placeholder="Enter your email or phone number"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#101B2D]">
                  Password
                </label>

                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className={`${inputClass} pr-12`}
                    placeholder="Enter your password"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center px-4 text-gray-500 hover:text-[#101B2D]"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff size={20} />
                    ) : (
                      <Eye size={20} />
                    )}
                  </button>
                </div>

                <div className="mt-2 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      clearMessages();
                      setEmail(
                        identifier.includes("@") ? identifier.trim() : ""
                      );
                      setMode("forgot");
                    }}
                    className="text-sm font-medium text-[#A47B35] hover:underline"
                  >
                    Forgot Password?
                  </button>
                </div>
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className={buttonClass}
              >
                {submitting ? "Signing in..." : "Sign In"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-600">
              Don't have an account?{" "}
              <Link
                to="/register"
                className="font-semibold text-[#A47B35] hover:underline"
              >
                Register here
              </Link>
            </p>

            <Link
              to="/"
              className="mt-4 block text-center text-sm text-gray-500"
            >
              Back to store
            </Link>
          </>
        )}

        {/* REQUEST OTP */}
        {mode === "forgot" && (
          <>
            <button
              type="button"
              onClick={() => {
                clearMessages();
                setMode("login");
              }}
              className="mt-6 flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-[#101B2D]"
            >
              <ArrowLeft size={17} />
              Back to Sign In
            </button>

            <h1 className="mt-6 text-2xl font-bold text-[#101B2D]">
              Forgot Password?
            </h1>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              Enter your registered email address. We'll send you a six-digit
              OTP to reset your password.
            </p>

            <form onSubmit={handleForgotPassword} className="mt-7 space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#101B2D]">
                  Email Address
                </label>

                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className={inputClass}
                  placeholder="Enter your registered email"
                />
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={resetLoading}
                className={buttonClass}
              >
                {resetLoading ? "Sending OTP..." : "Send OTP"}
              </button>
            </form>
          </>
        )}

        {/* VERIFY OTP */}
        {mode === "verify" && (
          <>
            <button
              type="button"
              onClick={() => {
                clearMessages();
                setMode("forgot");
              }}
              className="mt-6 flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-[#101B2D]"
            >
              <ArrowLeft size={17} />
              Change Email
            </button>

            <h1 className="mt-6 text-2xl font-bold text-[#101B2D]">
              Verify OTP
            </h1>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              Enter the six-digit OTP sent to your email address.
            </p>

            <p className="mt-2 break-all text-sm font-semibold text-[#A47B35]">
              {email}
            </p>

            {success && (
              <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
                {success}
              </p>
            )}

            <form onSubmit={handleVerifyOTP} className="mt-6 space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#101B2D]">
                  Six-Digit OTP
                </label>

                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={6}
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className={`${inputClass} text-center text-xl font-bold tracking-[0.5em]`}
                  placeholder="000000"
                />
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={resetLoading || otp.length !== 6}
                className={buttonClass}
              >
                {resetLoading ? "Verifying..." : "Verify OTP"}
              </button>
            </form>
          </>
        )}

        {/* RESET PASSWORD */}
        {mode === "reset" && (
          <>
            <h1 className="mt-6 text-2xl font-bold text-[#101B2D]">
              Create New Password
            </h1>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              Your OTP has been verified. Choose a new password for your
              G-MART account.
            </p>

            {success && (
              <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
                {success}
              </p>
            )}

            <form onSubmit={handleResetPassword} className="mt-6 space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#101B2D]">
                  New Password
                </label>

                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={`${inputClass} pr-12`}
                    placeholder="Enter new password"
                  />

                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute inset-y-0 right-0 flex items-center px-4 text-gray-500 hover:text-[#101B2D]"
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? (
                      <EyeOff size={20} />
                    ) : (
                      <Eye size={20} />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#101B2D]">
                  Confirm New Password
                </label>

                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`${inputClass} pr-12`}
                    placeholder="Confirm new password"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowConfirmPassword(!showConfirmPassword)
                    }
                    className="absolute inset-y-0 right-0 flex items-center px-4 text-gray-500 hover:text-[#101B2D]"
                    aria-label={
                      showConfirmPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showConfirmPassword ? (
                      <EyeOff size={20} />
                    ) : (
                      <Eye size={20} />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={resetLoading}
                className={buttonClass}
              >
                {resetLoading ? "Resetting Password..." : "Reset Password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
