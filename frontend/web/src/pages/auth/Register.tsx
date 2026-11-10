
import { useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import api from "../../services/api";

export default function Register() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError("");
    setSuccess("");

    if (!email.trim() && !phone.trim()) {
      setError("Please provide an email address or phone number.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Password and Confirm Password do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    setSubmitting(true);

    try {
      await api.post("/auth/register", {
        full_name: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        password,
      });

      setSuccess("Your account has been created successfully. Please log in.");

      setFullName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      const detail = err.response?.data?.detail;

      setError(
        typeof detail === "string"
          ? detail
          : "Unable to create your account. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F5EF] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <Link to="/" className="text-3xl font-black text-[#101B2D]">
          G-MART
        </Link>

        <h1 className="mt-6 text-2xl font-bold text-[#101B2D]">
          Create Account
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Join G-MART and enjoy convenient shopping.
          <span className="mt-1 block text-xs font-medium text-[#A47B35]">
                Phone Number / Email – At least one is mandatory.
            </span>
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          {/* Full Name */}
          <div>
            <label className="mb-2 block text-sm font-medium text-[#101B2D]">
              Full Name
            </label>

            <input
              type="text"
              required
              minLength={2}
              maxLength={150}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-[#D6B875]"
              placeholder="Enter your full name"
            />
          </div>

          {/* Email */}
          <div>
            <label className="mb-2 block text-sm font-medium text-[#101B2D]">
              Email Address
              <span className="ml-1 text-gray-400 font-normal">(Optional)</span>
            </label>

            <input
              type="email"
              maxLength={150}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-[#D6B875]"
              placeholder="Enter your email address"
            />
          </div>

          {/* Phone Number */}
          <div>
            <label className="mb-2 block text-sm font-medium text-[#101B2D]">
              Phone Number
              <span className="ml-1 text-gray-400 font-normal">(Optional)</span>
            </label>

            <input
              type="tel"
              minLength={10}
              maxLength={15}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-[#D6B875]"
              placeholder="Enter your phone number"
            />
          </div>

          <p className="text-xs text-gray-500 -mt-2">
            Provide your email address, phone number, or both.
          </p>

          {/* Password */}
          <div>
            <label className="mb-2 block text-sm font-medium text-[#101B2D]">
              Password
            </label>

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 pr-12 outline-none focus:border-[#D6B875]"
                placeholder="Create a password"
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center px-4 text-gray-500 hover:text-[#101B2D]"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="mb-2 block text-sm font-medium text-[#101B2D]">
              Confirm Password
            </label>

            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 pr-12 outline-none focus:border-[#D6B875]"
                placeholder="Confirm your password"
              />

              <button
                type="button"
                onClick={() =>
                  setShowConfirmPassword(!showConfirmPassword)
                }
                className="absolute inset-y-0 right-0 flex items-center px-4 text-gray-500 hover:text-[#101B2D]"
                aria-label={
                  showConfirmPassword
                    ? "Hide confirm password"
                    : "Show confirm password"
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

          {/* Error Message */}
          {error && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </p>
          )}

          {/* Success Message */}
          {success && (
            <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
              {success}{" "}
              <Link to="/login" className="font-semibold underline">
                Login here
              </Link>
            </p>
          )}

          {/* Register Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-[#101B2D] py-3 font-semibold text-white hover:bg-[#1C2B42] disabled:opacity-50"
          >
            {submitting ? "Creating Account..." : "Create Account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-semibold text-[#A47B35] hover:underline"
          >
            Login here
          </Link>
        </p>

        <Link to="/" className="mt-4 block text-center text-sm text-gray-500">
          Back to store
        </Link>
      </div>
    </div>
  );
}
