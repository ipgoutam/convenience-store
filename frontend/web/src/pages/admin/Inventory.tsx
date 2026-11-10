
import { useEffect, useState } from "react";
import api from "../../services/api";

interface InventoryMovement {
  id: number;
  product_id: number | null;
  product_name: string;
  quantity_change: number;
  previous_stock: number;
  new_stock: number;
  movement_type: string;
  reason: string | null;
  changed_by_user_id: number | null;
  changed_by_name: string | null;
  order_id: number | null;
  created_at: string;
}

interface InventorySummary {
  total_movements: number;
  stock_added: number;
  stock_removed: number;
}

function Inventory() {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [summary, setSummary] = useState<InventorySummary>({
    total_movements: 0,
    stock_added: 0,
    stock_removed: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [movementType, setMovementType] = useState("");
  const [productId, setProductId] = useState("");

  const [skip, setSkip] = useState(0);
  const limit = 50;

  const loadInventory = async () => {
    try {
      setLoading(true);
      setError("");

      const params: Record<string, string | number> = {
        skip,
        limit,
      };

      if (productId.trim()) {
        params.product_id = productId;
      }

      if (movementType) {
        params.movement_type = movementType;
      }

      const [summaryResponse, movementsResponse] =
        await Promise.all([
          api.get("/inventory/summary"),
          api.get("/inventory/movements", { params }),
        ]);

      setSummary(summaryResponse.data);
      setMovements(movementsResponse.data);
    } catch (err: any) {
      console.error("Inventory loading error:", err);

      setError(
        err.response?.data?.detail ||
          "Unable to load inventory history."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, [skip, productId, movementType]);

  const filteredMovements = movements.filter((movement) =>
    movement.product_name
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatMovementType = (type: string) => {
    return type
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">

      {/* HEADER */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy md:text-3xl">
            Inventory Management
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Track stock changes and inventory movement history.
          </p>
        </div>

        <button
          onClick={loadInventory}
          className="rounded-lg bg-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-secondary"
        >
          Refresh History
        </button>
      </div>

      {/* SUMMARY CARDS */}
      <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Total Movements
          </p>

          <h2 className="mt-2 text-3xl font-bold text-navy">
            {summary.total_movements}
          </h2>

          <p className="mt-2 text-xs text-gray-400">
            Recorded stock changes
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Total Stock Added
          </p>

          <h2 className="mt-2 text-3xl font-bold text-green-600">
            +{summary.stock_added}
          </h2>

          <p className="mt-2 text-xs text-gray-400">
            Units added to inventory
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Total Stock Removed
          </p>

          <h2 className="mt-2 text-3xl font-bold text-red-600">
            -{summary.stock_removed}
          </h2>

          <p className="mt-2 text-xs text-gray-400">
            Units removed from inventory
          </p>
        </div>

      </div>

      {/* FILTERS */}
      <div className="mb-6 rounded-xl border bg-white p-5 shadow-sm">

        <h2 className="mb-4 text-lg font-semibold text-navy">
          Filter Inventory History
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-600">
              Search Product
            </label>

            <input
              type="text"
              placeholder="Enter product name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-600">
              Product ID
            </label>

            <input
              type="number"
              min="1"
              placeholder="Enter product ID..."
              value={productId}
              onChange={(e) => {
                setSkip(0);
                setProductId(e.target.value);
              }}
              className="form-input"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-600">
              Movement Type
            </label>

            <select
              value={movementType}
              onChange={(e) => {
                setSkip(0);
                setMovementType(e.target.value);
              }}
              className="form-input"
            >
              <option value="">All Movements</option>
              <option value="initial_stock">Initial Stock</option>
              <option value="manual_adjustment">
                Manual Adjustment
              </option>
              <option value="order_sale">Order Sale</option>
              <option value="order_cancellation">
                Order Cancellation
              </option>
            </select>
          </div>

        </div>

      </div>

      {/* ERROR */}
      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* MOVEMENT HISTORY */}
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">

        <div className="border-b p-5">
          <h2 className="text-lg font-semibold text-navy">
            Stock Movement History
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Showing {filteredMovements.length} records on this page.
          </p>
        </div>

        {loading ? (
          <div className="p-10 text-center text-gray-500">
            Loading inventory history...
          </div>
        ) : filteredMovements.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
            No inventory movements found.
          </div>
        ) : (
          <div className="overflow-x-auto">

            <table className="w-full min-w-[1050px] text-left text-sm">

              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-5 py-4">Product</th>
                  <th className="px-5 py-4">Movement</th>
                  <th className="px-5 py-4">Previous</th>
                  <th className="px-5 py-4">Change</th>
                  <th className="px-5 py-4">New Stock</th>
                  <th className="px-5 py-4">Changed By</th>
                  <th className="px-5 py-4">Reason</th>
                  <th className="px-5 py-4">Date</th>
                </tr>
              </thead>

              <tbody className="divide-y">

                {filteredMovements.map((movement) => (
                  <tr
                    key={movement.id}
                    className="hover:bg-gray-50"
                  >

                    <td className="px-5 py-4">
                      <p className="font-semibold text-gray-800">
                        {movement.product_name}
                      </p>

                      <p className="text-xs text-gray-400">
                        Product ID: #{movement.product_id ?? "Deleted"}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                        {formatMovementType(movement.movement_type)}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-gray-600">
                      {movement.previous_stock}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={
                          movement.quantity_change > 0
                            ? "font-semibold text-green-600"
                            : movement.quantity_change < 0
                            ? "font-semibold text-red-600"
                            : "text-gray-500"
                        }
                      >
                        {movement.quantity_change > 0 ? "+" : ""}
                        {movement.quantity_change}
                      </span>
                    </td>

                    <td className="px-5 py-4 font-semibold text-navy">
                      {movement.new_stock}
                    </td>

                    <td className="px-5 py-4 text-gray-600">
                      {movement.changed_by_name || "Unknown"}
                      {movement.changed_by_user_id && (
                        <p className="text-xs text-gray-400">
                          ID: #{movement.changed_by_user_id}
                        </p>
                      )}
                    </td>

                    <td className="max-w-[180px] px-5 py-4 text-gray-600">
                      {movement.reason || "—"}
                      {movement.order_id && (
                        <p className="mt-1 text-xs text-gray-400">
                          Order: #{movement.order_id}
                        </p>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-gray-500">
                      {formatDate(movement.created_at)}
                    </td>

                  </tr>
                ))}

              </tbody>
            </table>

          </div>
        )}

        {/* PAGINATION */}
        <div className="flex items-center justify-between border-t p-4">

          <button
            disabled={skip === 0 || loading}
            onClick={() => setSkip(Math.max(0, skip - limit))}
            className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>

          <span className="text-sm text-gray-500">
            Page {Math.floor(skip / limit) + 1}
          </span>

          <button
            disabled={loading || movements.length < limit}
            onClick={() => setSkip(skip + limit)}
            className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>

        </div>

      </div>

    </div>
  );
}

export default Inventory;
