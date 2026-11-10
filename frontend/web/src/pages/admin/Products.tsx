
import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";

interface Product {
  id: number;
  name: string;
  description: string | null;
  brand: string | null;
  category: string;
  sku: string | null;
  barcode: string | null;
  price: string | number;
  mrp: string | number | null;
  cost_price: string | number | null;
  discount_percentage: string | number;
  discounted_price: string | number;
  unit: string;
  allow_purchase_by_amount: boolean;
  stock: number;
  low_stock_threshold: number | null;
  image_url: string | null;
  expiry_date: string | null;
  is_available: boolean;
}

interface ProductImage {
  id: number;
  product_id: number;
  image_url: string;
  display_order: number;
}

interface ProductForm {
  name: string;
  description: string;
  brand: string;
  category: string;
  sku: string;
  barcode: string;
  price: string;
  mrp: string;
  cost_price: string;
  discount_percentage: string;
  unit: string;
  allow_purchase_by_amount: boolean;
  stock: string;
  low_stock_threshold: string;
  image_url: string;
  expiry_date: string;
  is_available: boolean;
}

const emptyForm: ProductForm = {
  name: "",
  description: "",
  brand: "",
  category: "",
  sku: "",
  barcode: "",
  price: "",
  mrp: "",
  cost_price: "",
  discount_percentage: "0",
  unit: "piece",
  allow_purchase_by_amount: false,
  stock: "0",
  low_stock_threshold: "5",
  image_url: "",
  expiry_date: "",
  is_available: true,
};

const units = ["piece", "packet", "bottle", "kg", "g", "litre", "ml"];

export default function Products() {
  const { user, loading: authLoading, logout } = useAuth();
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [productImages, setProductImages] = useState<ProductImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [imageActionLoading, setImageActionLoading] = useState(false);
  const [frequentlyBoughtIds, setFrequentlyBoughtIds] = useState<number[]>([]);
  const [frequentlyBoughtSearch, setFrequentlyBoughtSearch] = useState("");
  const [loadingFrequentlyBought, setLoadingFrequentlyBought] = useState(false);
  const [savingFrequentlyBought, setSavingFrequentlyBought] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [categorySearch, setCategorySearch] = useState("");
  const [addingNewCategory, setAddingNewCategory] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!user || !["admin", "super_admin"].includes(user.role)) {
      navigate("/login");
      return;
    }

    loadProducts();
  }, [user, authLoading]);

  const loadProducts = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get<Product[]>("/products/");
      setProducts(response.data);
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Unable to load products."
      );
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(search.toLowerCase()) ||
        product.category.toLowerCase().includes(search.toLowerCase()) ||
        (product.brand || "").toLowerCase().includes(search.toLowerCase());

      const matchesFilter =
        filter === "all" ||
        (filter === "available" && product.is_available) ||
        (filter === "unavailable" && !product.is_available) ||
        (filter === "low-stock" &&
          product.stock <= (product.low_stock_threshold ?? 5));

      return matchesSearch && matchesFilter;
    });
  }, [products, search, filter]);

  const categories = useMemo(() => {
    return Array.from(
      new Set(
        products
          .map((product) => product.category.trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const filteredCategories = useMemo(() => {
    return categories.filter((category) =>
      category.toLowerCase().includes(categorySearch.toLowerCase())
    );
  }, [categories, categorySearch]);

  const loadProductImages = async (productId: number) => {
    setLoadingImages(true);
    try {
      const response = await api.get<ProductImage[]>(
        `/product-details/${productId}/images`
      );
      const images = Array.isArray(response.data)
        ? [...response.data].sort(
            (a, b) => a.display_order - b.display_order
          )
        : [];
      setProductImages(images);
      setForm((previous) => ({
        ...previous,
        image_url: images[0]?.image_url || "",
      }));
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Unable to load product images."
      );
      setProductImages([]);
    } finally {
      setLoadingImages(false);
    }
  };

  const saveImageOrder = async (nextImages: ProductImage[]) => {
    if (!editingProduct) return;

    if (nextImages.some((image) => image.id === 0)) {
      setError(
        "Add another image first to migrate the existing main image into the gallery."
      );
      return;
    }

    setImageActionLoading(true);
    setError("");
    setSuccess("");

    try {
      await api.put(
        `/product-details/${editingProduct.id}/images/reorder`,
        {
          images: nextImages.map((image, index) => ({
            id: image.id,
            display_order: index,
          })),
        }
      );
      await loadProductImages(editingProduct.id);
      await loadProducts();
      setSuccess("Product image order updated.");
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Unable to reorder product images."
      );
    } finally {
      setImageActionLoading(false);
    }
  };

  const moveProductImage = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= productImages.length) return;

    const nextImages = [...productImages];
    [nextImages[index], nextImages[targetIndex]] = [
      nextImages[targetIndex],
      nextImages[index],
    ];
    await saveImageOrder(nextImages);
  };

  const deleteProductImage = async (image: ProductImage) => {
    if (!editingProduct) return;

    if (image.id === 0) {
      setError(
        "This is the existing main image. Add another image first to migrate it into the gallery."
      );
      return;
    }

    if (!window.confirm("Delete this product image?")) return;

    setImageActionLoading(true);
    setError("");
    setSuccess("");

    try {
      await api.delete(`/product-details/images/${image.id}`);
      await loadProductImages(editingProduct.id);
      await loadProducts();
      setSuccess("Product image deleted.");
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Unable to delete product image."
      );
    } finally {
      setImageActionLoading(false);
    }
  };

  const loadFrequentlyBought = async (productId: number) => {
    setLoadingFrequentlyBought(true);
    try {
      const response = await api.get(
        `/product-details/${productId}/frequently-bought-together`
      );
      const data = response.data;
      const rawItems = Array.isArray(data)
        ? data
        : Array.isArray(data?.product_ids)
          ? data.product_ids
          : Array.isArray(data?.items)
            ? data.items
            : Array.isArray(data?.products)
              ? data.products
              : [];

      const ids = rawItems
        .map((item: any) => {
          if (typeof item === "number" || typeof item === "string") {
            return Number(item);
          }
          return Number(item?.product_id ?? item?.id);
        })
        .filter((id: number) => Number.isInteger(id) && id > 0 && id !== productId);

      setFrequentlyBoughtIds(Array.from(new Set(ids)).slice(0, 20));
    } catch (err: any) {
      setFrequentlyBoughtIds([]);
      setError(
        err.response?.data?.detail ||
          "Unable to load Frequently Bought Together products."
      );
    } finally {
      setLoadingFrequentlyBought(false);
    }
  };

  const toggleFrequentlyBoughtProduct = (productId: number) => {
    setFrequentlyBoughtIds((previous) => {
      if (previous.includes(productId)) {
        return previous.filter((id) => id !== productId);
      }
      if (previous.length >= 20) {
        setError("You can select a maximum of 20 complementary products.");
        return previous;
      }
      return [...previous, productId];
    });
  };

  const saveFrequentlyBought = async () => {
    if (!editingProduct) return;

    setSavingFrequentlyBought(true);
    setError("");
    setSuccess("");
    try {
      await api.put(
        `/product-details/${editingProduct.id}/frequently-bought-together`,
        { product_ids: frequentlyBoughtIds }
      );
      setSuccess("Frequently Bought Together products saved.");
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          "Unable to save Frequently Bought Together products."
      );
    } finally {
      setSavingFrequentlyBought(false);
    }
  };

  const updateField = (field: keyof ProductForm, value: string | boolean) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const openAddForm = () => {
    setEditingProduct(null);
    setForm(emptyForm);
    setProductImages([]);
    setFrequentlyBoughtIds([]);
    setFrequentlyBoughtSearch("");
    setShowForm(true);
    setError("");
    setSuccess("");
    setCategorySearch("");
    setAddingNewCategory(false);
  };

  const openEditForm = (product: Product) => {
    setEditingProduct(product);
    setProductImages([]);
    setFrequentlyBoughtIds([]);
    setFrequentlyBoughtSearch("");
    void loadProductImages(product.id);
    void loadFrequentlyBought(product.id);

    setForm({
      name: product.name,
      description: product.description || "",
      brand: product.brand || "",
      category: product.category,
      sku: product.sku || "",
      barcode: product.barcode || "",
      price: String(product.price),
      mrp: product.mrp == null ? "" : String(product.mrp),
      cost_price:
        product.cost_price == null ? "" : String(product.cost_price),
      discount_percentage: String(product.discount_percentage),
      unit: product.unit,
      allow_purchase_by_amount: product.allow_purchase_by_amount ?? false,
      stock: String(product.stock),
      low_stock_threshold:
        product.low_stock_threshold == null
          ? ""
          : String(product.low_stock_threshold),
      image_url: product.image_url || "",
      expiry_date: product.expiry_date || "",
      is_available: product.is_available,
    });
    setCategorySearch("");
    setAddingNewCategory(false);
    setShowForm(true);
    setError("");
    setSuccess("");
  };

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      setError("Only JPG, JPEG, PNG and WEBP images are allowed.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Image size must be less than 5 MB.");
      event.target.value = "";
      return;
    }

    const data = new FormData();
    data.append("file", file);

    setUploading(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.post(
        "/products/upload-image/",
        data,
        {
          headers: {
            "Content-Type": undefined,
          },
        }
      );

      const uploadedImageUrl = response.data.image_url;

      if (editingProduct) {
        if (productImages.length >= 8) {
          setError("A product can have a maximum of 8 images.");
          return;
        }

        await api.post(
          `/product-details/${editingProduct.id}/images`,
          null,
          { params: { image_url: uploadedImageUrl } }
        );

        await loadProductImages(editingProduct.id);
        await loadProducts();
        setSuccess("Product image added to the gallery.");
      } else {
        updateField("image_url", uploadedImageUrl);
        setSuccess(
          "Main image uploaded. Save the product, then edit it to add more gallery images."
        );
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail;

      if (Array.isArray(detail)) {
        setError(
          detail
            .map((item: any) => {
              const location = Array.isArray(item.loc)
                ? item.loc.join(" → ")
                : "";

              return `${location}: ${item.msg}`;
            })
            .join(" | ")
        );
      } else if (typeof detail === "string") {
        setError(detail);
      } else {
        setError("Image upload failed. Please try again.");
      }

      console.error("Image upload error:", err.response?.data || err);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    setSaving(true);
    setError("");
    setSuccess("");

    const commonData = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      brand: form.brand.trim() || null,
      category: form.category.trim(),
      sku: form.sku.trim() || null,
      barcode: form.barcode.trim() || null,
      price: Number(form.price),
      mrp: form.mrp ? Number(form.mrp) : null,
      cost_price: form.cost_price ? Number(form.cost_price) : null,
      discount_percentage: Number(form.discount_percentage || 0),
      unit: form.unit,
      allow_purchase_by_amount: form.allow_purchase_by_amount,
      stock: Number(form.stock),
      low_stock_threshold: form.low_stock_threshold
        ? Number(form.low_stock_threshold)
        : null,
      image_url: form.image_url.trim() || null,
      expiry_date: form.expiry_date || null,
    };

    try {
      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, {
          ...commonData,
          is_available: form.is_available,
        });

        setSuccess("Product updated successfully.");
      } else {
        await api.post("/products/", commonData);

        setSuccess("Product added successfully.");
      }

      setShowForm(false);
      setEditingProduct(null);
      setForm(emptyForm);

      await loadProducts();
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Unable to save product."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (product: Product) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${product.name}"?`
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      await api.delete(`/products/${product.id}`);

      setSuccess("Product deleted successfully.");
      await loadProducts();
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Unable to delete product."
      );
    }
  };

  const changeStock = async (product: Product, quantity: number) => {
    if (product.stock + quantity < 0) return;

    try {
      await api.patch(
        `/products/${product.id}/stock`,
        null,
        { params: { quantity } }
      );

      await loadProducts();
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Unable to update stock."
      );
    }
  };

  const toggleAvailability = async (product: Product) => {
    try {
      await api.patch(
        `/products/${product.id}/availability`,
        null,
        { params: { is_available: !product.is_available } }
      );

      setSuccess("Product availability updated.");
      await loadProducts();
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Unable to update availability."
      );
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F5EF]">
        Loading products...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F5EF]">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-[#101B2D] px-6 py-5 text-white">
        <div>
          <h1 className="text-2xl font-black">G-MART</h1>
          <p className="text-sm text-gray-300">Admin Product Management</p>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm">{user?.full_name}</span>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-white/30 px-4 py-2 text-sm hover:bg-white/10"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[#101B2D]">
              Products
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Add, edit and manage your store inventory.
            </p>
          </div>

          <button
            onClick={openAddForm}
            className="rounded-lg bg-[#101B2D] px-5 py-3 font-semibold text-white hover:bg-[#1C2B42]"
          >
            + Add Product
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            {success}
          </div>
        )}

        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Total Products</p>
            <p className="mt-2 text-3xl font-bold text-[#101B2D]">
              {products.length}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Low Stock Products</p>
            <p className="mt-2 text-3xl font-bold text-orange-600">
              {
                products.filter(
                  (p) => p.stock <= (p.low_stock_threshold ?? 5)
                ).length
              }
            </p>
          </div>
        </div>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products, brands or categories..."
            className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 outline-none focus:border-[#D6B875]"
          />

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-3"
          >
            <option value="all">All products</option>
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
            <option value="low-stock">Low stock</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-[#101B2D] text-white">
              <tr>
                <th className="p-4">Product</th>
                <th className="p-4">Category</th>
                <th className="p-4">Price</th>
                <th className="p-4">Stock</th>
                <th className="p-4">Availability</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id} className="border-b border-gray-100">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      {product.image_url && (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                      )}

                      <div>
                        <p className="font-semibold text-[#101B2D]">
                          {product.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {product.brand || "No brand"}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="p-4">{product.category}</td>

                  <td className="p-4">
                    ₹{Number(product.discounted_price).toFixed(2)}
                    {Number(product.discount_percentage) > 0 && (
                      <p className="text-xs text-green-600">
                        {Number(product.discount_percentage)}% off
                      </p>
                    )}
                  </td>

                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => changeStock(product, -1)}
                        disabled={product.stock <= 0}
                        className="rounded bg-gray-100 px-2 py-1 disabled:opacity-40"
                      >
                        −
                      </button>

                      <span className="min-w-6 text-center font-semibold">
                        {product.stock}
                      </span>

                      <button
                        onClick={() => changeStock(product, 1)}
                        className="rounded bg-gray-100 px-2 py-1"
                      >
                        +
                      </button>
                    </div>

                    {product.stock <= (product.low_stock_threshold ?? 5) && (
                      <p className="mt-1 text-xs text-orange-600">
                        Low stock
                      </p>
                    )}
                  </td>

                  <td className="p-4">
                    <button
                      onClick={() => toggleAvailability(product)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        product.is_available
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {product.is_available ? "Available" : "Unavailable"}
                    </button>
                  </td>

                  <td className="p-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditForm(product)}
                        className="rounded-lg bg-blue-50 px-3 py-2 text-blue-700"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => handleDelete(product)}
                        className="rounded-lg bg-red-50 px-3 py-2 text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-gray-500">
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {showForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <div className="mx-auto my-6 max-w-3xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#101B2D]">
                {editingProduct ? "Edit Product" : "Add New Product"}
              </h2>

              <button
                onClick={() => setShowForm(false)}
                className="text-2xl text-gray-500"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Product Name *">
                  <input
                    required
                    minLength={2}
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    className="form-input"
                  />
                </FormField>

                <FormField label="Brand">
                  <input
                    value={form.brand}
                    onChange={(e) => updateField("brand", e.target.value)}
                    className="form-input"
                  />
                </FormField>

                <div className="sm:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Product Category *
                  </label>

                  {/* Search categories */}
                  <input
                    type="text"
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    placeholder="Search categories..."
                    className="form-input mb-3"
                  />

                  {/* Existing category radio buttons */}
                  <div className="grid grid-cols-1 gap-2 rounded-xl border border-gray-200 p-4 sm:grid-cols-2">
                    {filteredCategories.map((category) => (
                      <label
                        key={category}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                          form.category === category && !addingNewCategory
                            ? "border-[#D6B875] bg-[#F7F5EF]"
                            : "border-gray-100 hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="product-category"
                          value={category}
                          checked={
                            form.category === category && !addingNewCategory
                          }
                          onChange={() => {
                            updateField("category", category);
                            setAddingNewCategory(false);
                          }}
                          className="h-4 w-4 accent-[#101B2D]"
                        />

                        <span className="text-sm font-medium text-gray-700">
                          {category}
                        </span>
                      </label>
                    ))}

                    {filteredCategories.length === 0 && (
                      <p className="col-span-full py-2 text-sm text-gray-500">
                        No matching categories found.
                      </p>
                    )}

                    {/* Add new category option */}
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                        addingNewCategory
                          ? "border-[#D6B875] bg-[#F7F5EF]"
                          : "border-gray-100 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="product-category"
                        checked={addingNewCategory}
                        onChange={() => {
                          setAddingNewCategory(true);
                          updateField("category", "");
                        }}
                        className="h-4 w-4 accent-[#101B2D]"
                      />

                      <span className="text-sm font-semibold text-[#101B2D]">
                        + Add New Category
                      </span>
                    </label>
                  </div>

                  {/* New category input */}
                  {addingNewCategory && (
                    <input
                      type="text"
                      required
                      minLength={2}
                      value={form.category}
                      onChange={(e) => updateField("category", e.target.value)}
                      placeholder="Enter new category name"
                      className="form-input mt-3"
                    />
                  )}

                  {form.category && (
                    <p className="mt-2 text-xs text-green-700">
                      Selected category: {form.category}
                    </p>
                  )}
                </div>

                <FormField label="Selling Unit">
                  <select
                    value={form.unit}
                    onChange={(e) => updateField("unit", e.target.value)}
                    className="form-input"
                  >
                    {units.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="SKU">
                  <input
                    value={form.sku}
                    onChange={(e) => updateField("sku", e.target.value)}
                    className="form-input"
                  />
                </FormField>

                <FormField label="Barcode">
                  <input
                    value={form.barcode}
                    onChange={(e) => updateField("barcode", e.target.value)}
                    className="form-input"
                  />
                </FormField>

                <FormField label="Selling Price (₹) *">
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => updateField("price", e.target.value)}
                    className="form-input"
                  />
                </FormField>

                <FormField label="MRP (₹)">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.mrp}
                    onChange={(e) => updateField("mrp", e.target.value)}
                    className="form-input"
                  />
                </FormField>

                <FormField label="Cost Price (₹)">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.cost_price}
                    onChange={(e) => updateField("cost_price", e.target.value)}
                    className="form-input"
                  />
                </FormField>

                <FormField label="Discount (%)">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.discount_percentage}
                    onChange={(e) =>
                      updateField("discount_percentage", e.target.value)
                    }
                    className="form-input"
                  />
                </FormField>

                <FormField label="Stock Quantity *">
                  <input
                    type="number"
                    required
                    min="0"
                    step="1"
                    value={form.stock}
                    onChange={(e) => updateField("stock", e.target.value)}
                    className="form-input"
                  />
                </FormField>

                <FormField label="Low Stock Threshold">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.low_stock_threshold}
                    onChange={(e) =>
                      updateField("low_stock_threshold", e.target.value)
                    }
                    className="form-input"
                  />
                </FormField>

                <FormField label="Expiry Date">
                  <input
                    type="date"
                    value={form.expiry_date}
                    onChange={(e) => updateField("expiry_date", e.target.value)}
                    className="form-input"
                  />
                </FormField>

                <div className="sm:col-span-2 rounded-xl border border-gray-200 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-[#101B2D]">
                        Product Image Gallery
                      </h3>
                      <p className="text-xs text-gray-500">
                        Add up to 8 images. The first image is the main product image.
                      </p>
                    </div>
                    {editingProduct && (
                      <span className="text-xs font-medium text-gray-500">
                        {productImages.length}/8 images
                      </span>
                    )}
                  </div>

                  <label className="mb-3 block text-sm font-medium text-gray-700">
                    {editingProduct ? "Add gallery image" : "Main product image"}
                  </label>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp"
                    onChange={handleImageUpload}
                    disabled={
                      uploading ||
                      (Boolean(editingProduct) && productImages.length >= 8)
                    }
                    className="w-full text-sm disabled:opacity-50"
                  />

                  {uploading && (
                    <p className="mt-2 text-xs text-blue-600">
                      Uploading image...
                    </p>
                  )}

                  {!editingProduct && form.image_url && (
                    <div className="mt-3 flex items-center gap-3">
                      <img
                        src={form.image_url}
                        alt="Main product preview"
                        className="h-20 w-20 rounded-lg border object-contain bg-[#F7F5EF]"
                      />
                      <p className="break-all text-xs text-green-700">
                        Main image uploaded. Save the product first, then edit it to manage the full gallery.
                      </p>
                    </div>
                  )}

                  {editingProduct && (
                    <div className="mt-4">
                      {loadingImages ? (
                        <p className="text-sm text-gray-500">
                          Loading product images...
                        </p>
                      ) : productImages.length === 0 ? (
                        <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
                          No product images yet. Upload the first image above.
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          {productImages.map((image, index) => (
                            <div
                              key={image.id || `legacy-${image.product_id}`}
                              className="rounded-xl border border-gray-200 p-2"
                            >
                              <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-[#F7F5EF]">
                                <img
                                  src={image.image_url}
                                  alt={`${form.name} image ${index + 1}`}
                                  className="h-full w-full object-contain"
                                />
                                {index === 0 && (
                                  <span className="absolute left-2 top-2 rounded bg-[#D6B875] px-2 py-1 text-[10px] font-bold text-[#101B2D]">
                                    MAIN
                                  </span>
                                )}
                              </div>
                              <p className="mt-2 text-center text-xs text-gray-500">
                                Image {index + 1}
                              </p>
                              <div className="mt-2 flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => moveProductImage(index, -1)}
                                  disabled={
                                    index === 0 ||
                                    imageActionLoading ||
                                    productImages.some((item) => item.id === 0)
                                  }
                                  title="Move left"
                                  className="rounded bg-gray-100 px-2 py-1 text-sm disabled:opacity-40"
                                >
                                  ←
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveProductImage(index, 1)}
                                  disabled={
                                    index === productImages.length - 1 ||
                                    imageActionLoading ||
                                    productImages.some((item) => item.id === 0)
                                  }
                                  title="Move right"
                                  className="rounded bg-gray-100 px-2 py-1 text-sm disabled:opacity-40"
                                >
                                  →
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteProductImage(image)}
                                  disabled={imageActionLoading || image.id === 0}
                                  title="Delete image"
                                  className="rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 disabled:opacity-40"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {productImages.some((image) => image.id === 0) && (
                        <p className="mt-3 text-xs text-amber-700">
                          Your existing main image is still in the legacy image field. Upload one more image to migrate it into the gallery; then you can reorder or delete images.
                        </p>
                      )}
                      {imageActionLoading && (
                        <p className="mt-2 text-xs text-blue-600">
                          Updating gallery...
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <div className="mb-3">
                  <h3 className="font-semibold text-[#101B2D]">
                    Frequently Bought Together
                  </h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Choose complementary products to recommend on this product's details page.
                    If none are selected, the customer page uses its same-category fallback.
                  </p>
                </div>

                {!editingProduct ? (
                  <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                    Save this product first. Then edit it to select Frequently Bought Together products.
                  </p>
                ) : (
                  <>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium text-gray-600">
                        {frequentlyBoughtIds.length}/20 selected
                      </span>
                      <button
                        type="button"
                        onClick={saveFrequentlyBought}
                        disabled={savingFrequentlyBought || loadingFrequentlyBought}
                        className="rounded-lg bg-[#101B2D] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {savingFrequentlyBought ? "Saving..." : "Save recommendations"}
                      </button>
                    </div>

                    <input
                      type="search"
                      value={frequentlyBoughtSearch}
                      onChange={(e) => setFrequentlyBoughtSearch(e.target.value)}
                      placeholder="Search products by name, brand or category..."
                      className="form-input mb-3"
                    />

                    {loadingFrequentlyBought ? (
                      <p className="py-4 text-sm text-gray-500">
                        Loading recommendations...
                      </p>
                    ) : (
                      <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-gray-100 p-2">
                        {products
                          .filter((product) => product.id !== editingProduct.id)
                          .filter((product) => {
                            const term = frequentlyBoughtSearch.trim().toLowerCase();
                            if (!term) return true;
                            return (
                              product.name.toLowerCase().includes(term) ||
                              (product.brand || "").toLowerCase().includes(term) ||
                              product.category.toLowerCase().includes(term)
                            );
                          })
                          .map((product) => (
                            <label
                              key={product.id}
                              className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-[#F7F5EF]"
                            >
                              <input
                                type="checkbox"
                                checked={frequentlyBoughtIds.includes(product.id)}
                                onChange={() => toggleFrequentlyBoughtProduct(product.id)}
                                disabled={
                                  !frequentlyBoughtIds.includes(product.id) &&
                                  frequentlyBoughtIds.length >= 20
                                }
                                className="h-4 w-4 accent-[#101B2D]"
                              />
                              {product.image_url ? (
                                <img
                                  src={product.image_url}
                                  alt={product.name}
                                  className="h-10 w-10 rounded-md bg-[#F7F5EF] object-contain"
                                />
                              ) : (
                                <div className="h-10 w-10 rounded-md bg-gray-100" />
                              )}
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-[#101B2D]">
                                  {product.name}
                                </span>
                                <span className="block truncate text-xs text-gray-500">
                                  {product.brand || product.category}
                                </span>
                              </span>
                              <span className="text-xs text-gray-500">
                                ₹{Number(product.discounted_price).toFixed(2)}
                              </span>
                            </label>
                          ))}
                        {products.filter((product) => product.id !== editingProduct.id).length === 0 && (
                          <p className="p-3 text-sm text-gray-500">No other products available.</p>
                        )}
                      </div>
                    )}
                    <p className="mt-2 text-xs text-gray-500">
                      Recommendations are saved separately. Remember to click “Save recommendations” after changing selections.
                    </p>
                  </>
                )}
              </div>

              {/* AMOUNT PURCHASING SETTING */}
              <div className="rounded-xl border border-[#D6B875] bg-[#F7F5EF] p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={form.allow_purchase_by_amount}
                    onChange={(e) =>
                      updateField(
                        "allow_purchase_by_amount",
                        e.target.checked
                      )
                    }
                    className="mt-1 h-4 w-4 accent-[#101B2D]"
                  />

                  <div>
                    <p className="font-semibold text-[#101B2D]">
                      Allow customers to buy by amount (₹)
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      Enable this for products such as rice, oil and loose
                      grains. Customers can enter an amount of money and
                      receive the corresponding quantity.
                    </p>

                    <p className="mt-2 text-xs font-medium text-gray-600">
                      Default: Disabled (quantity-based purchasing only).
                    </p>
                  </div>
                </label>
              </div>

              <FormField label="Description">
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  className="form-input"
                />
              </FormField>

              {editingProduct && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_available}
                    onChange={(e) =>
                      updateField("is_available", e.target.checked)
                    }
                  />
                  Product is available for customers
                </label>
              )}

              <div className="flex justify-end gap-3 border-t pt-5">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border px-5 py-3"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving || uploading}
                  className="rounded-lg bg-[#101B2D] px-6 py-3 font-semibold text-white disabled:opacity-50"
                >
                  {saving
                    ? "Saving..."
                    : editingProduct
                      ? "Update Product"
                      : "Add Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
    </div>
  );
}
