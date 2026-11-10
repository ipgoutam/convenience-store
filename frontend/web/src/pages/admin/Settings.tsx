
import { useEffect, useState } from "react";
import api from "../../services/api";

interface StoreSettings {
  id?: number;
  store_name: string;
  phone: string | null;
  address: string | null;
  opening_time: string;
  closing_time: string;
  is_open: boolean;
  online_payment_enabled: boolean;
  delivery_fee: string | number;
}

const defaultSettings: StoreSettings = {
  store_name: "G-MART",
  phone: "",
  address: "",
  opening_time: "07:00",
  closing_time: "22:00",
  is_open: true,
  online_payment_enabled: false,
  delivery_fee: 0,
};

function Settings() {
  const [settings, setSettings] =
    useState<StoreSettings>(defaultSettings);

  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get<StoreSettings>(
        "/store/settings"
      );

      setSettings({
        ...response.data,
        opening_time: response.data.opening_time.slice(0, 5),
        closing_time: response.data.closing_time.slice(0, 5),
      });

      setIsNew(false);
    } catch (err: unknown) {
      const apiError = err as {
        response?: {
          status?: number;
          data?: { detail?: string };
        };
      };

      if (apiError.response?.status === 404) {
        setIsNew(true);
        setSettings(defaultSettings);
      } else {
        setError(
          apiError.response?.data?.detail ||
            "Unable to load store settings."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    field: keyof StoreSettings,
    value: string | boolean
  ) => {
    setSettings((previous) => ({
      ...previous,
      [field]: value,
    }));

    setMessage("");
    setError("");
  };

  const handleSave = async () => {
    setError("");
    setMessage("");

    if (
      settings.closing_time <= settings.opening_time
    ) {
      setError("Closing time must be later than opening time.");
      return;
    }

    if (
      settings.phone &&
      !/^[0-9+\-\s]{10,15}$/.test(settings.phone)
    ) {
      setError("Please enter a valid phone number.");
      return;
    }

    const settingsData = {
      store_name: settings.store_name.trim(),
      phone: settings.phone?.trim() || null,
      address: settings.address?.trim() || null,
      opening_time: settings.opening_time,
      closing_time: settings.closing_time,
      is_open: settings.is_open,
      online_payment_enabled:
        settings.online_payment_enabled,
      delivery_fee: Number(settings.delivery_fee),
    };

    if (!settingsData.store_name) {
      setError("Store name is required.");
      return;
    }

    if (
      !Number.isFinite(settingsData.delivery_fee) ||
      settingsData.delivery_fee < 0
    ) {
      setError("Please enter a valid delivery fee.");
      return;
    }

    try {
      setSaving(true);

      if (isNew) {
        await api.post("/store/settings", settingsData);
        setIsNew(false);
      } else {
        await api.put("/store/settings", settingsData);
      }

      setMessage("Store settings saved successfully.");
      await fetchSettings();
    } catch (err: unknown) {
      const apiError = err as {
        response?: {
          data?: {
            detail?: string | { msg?: string }[];
          };
        };
      };

      const detail = apiError.response?.data?.detail;

      setError(
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((item) => item.msg || "Invalid value").join(", ")
            : "Unable to save store settings."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-navy">
        Loading store settings...
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-gray-300 bg-white px-4 py-3 outline-none focus:border-champagne";

  return (
    <div className="min-h-screen bg-ivory p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-navy">
            Store Settings
          </h1>
          <p className="mt-2 text-gray-500">
            Manage your G-MART store information and preferences.
          </p>
        </div>

        {isNew && (
          <div className="mb-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
            Store settings have not been created yet. Configure
            them below and save to create your settings.
          </div>
        )}

        <div className="space-y-6">
          {/* Store Information */}
          <section className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-xl font-semibold text-navy">
              Store Information
            </h2>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-navy">
                  Store Name
                </label>
                <input
                  value={settings.store_name}
                  onChange={(e) =>
                    handleChange("store_name", e.target.value)
                  }
                  className={inputClass}
                  placeholder="G-MART"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-navy">
                  Phone Number
                </label>
                <input
                  value={settings.phone || ""}
                  onChange={(e) =>
                    handleChange("phone", e.target.value)
                  }
                  className={inputClass}
                  placeholder="Enter store phone number"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-navy">
                  Store Address
                </label>
                <textarea
                  value={settings.address || ""}
                  onChange={(e) =>
                    handleChange("address", e.target.value)
                  }
                  className={inputClass}
                  rows={3}
                  placeholder="Enter store address"
                />
              </div>
            </div>
          </section>

          {/* Store Hours */}
          <section className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-xl font-semibold text-navy">
              Store Hours
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-navy">
                  Opening Time
                </label>
                <input
                  type="time"
                  value={settings.opening_time}
                  onChange={(e) =>
                    handleChange("opening_time", e.target.value)
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-navy">
                  Closing Time
                </label>
                <input
                  type="time"
                  value={settings.closing_time}
                  onChange={(e) =>
                    handleChange("closing_time", e.target.value)
                  }
                  className={inputClass}
                />
              </div>
            </div>

            <label className="mt-5 flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.is_open}
                onChange={(e) =>
                  handleChange("is_open", e.target.checked)
                }
                className="h-4 w-4"
              />
              <span className="font-medium text-navy">
                Store is currently open
              </span>
            </label>
          </section>

          {/* Delivery Settings */}
          <section className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-2 text-xl font-semibold text-navy">
              Delivery Settings
            </h2>

            <p className="mb-5 text-sm text-gray-500">
              Set the delivery fee charged for home delivery orders.
              Pickup orders will always have no delivery fee.
            </p>

            <div>
              <label className="mb-2 block text-sm font-medium text-navy">
                Delivery Fee (₹)
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={settings.delivery_fee}
                onChange={(e) =>
                  handleChange("delivery_fee", e.target.value)
                }
                className={inputClass}
                placeholder="30"
              />
            </div>
          </section>

          {/* Payment Settings */}
          <section className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-xl font-semibold text-navy">
              Payment Settings
            </h2>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.online_payment_enabled}
                onChange={(e) =>
                  handleChange(
                    "online_payment_enabled",
                    e.target.checked
                  )
                }
                className="h-4 w-4"
              />

              <span className="font-medium text-navy">
                Enable online payment
              </span>
            </label>

            <p className="mt-2 text-sm text-gray-500">
              Enable this only after integrating a payment gateway.
            </p>
          </section>

          {/* Messages */}
          {message && (
            <p className="rounded-lg bg-green-50 p-4 text-sm text-green-700">
              {message}
            </p>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-lg bg-navy px-6 py-3 font-semibold text-white transition hover:bg-navy-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Settings;
