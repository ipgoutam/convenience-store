
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  ImageOff,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import api from "../../services/api";

type Product = {
  id: number;
  name: string;
  description?: string | null;
  price: number;
  stock: number;
  category: string;
  image_url?: string | null;
  is_available: boolean;
  discount_percentage?: number;
  discounted_price?: number;
};

type HeroEntry = {
  id: number;
  product_id: number;
  display_order: number;
  is_visible: boolean;
  product: Product;
};

type Category = {
  id: number;
  name: string;
  description?: string | null;
  image_url?: string | null;
  is_active: boolean;
  show_on_home?: boolean;
  display_order?: number;
  show_in_popular: boolean;
  popular_display_order: number;
};

type PopularProduct = {
  id: number;
  name: string;
  sku?: string | null;
  stock: number;
  is_available: boolean;
  popular_display_order: number;
  image_url?: string | null;
};

function Homepage() {
  // Hero Carousel state
  const [entries, setEntries] = useState<HeroEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");

  // Popular Categories state
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [popularProducts, setPopularProducts] = useState<PopularProduct[]>([]);
  const [loadingPopularProducts, setLoadingPopularProducts] = useState(false);

  const [categoryNameMode, setCategoryNameMode] = useState<
    "existing" | "new"
  >("existing");
  const [selectedProductCategory, setSelectedProductCategory] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const availableProductsToAdd = useMemo(() => {
    const existingProductIds = new Set(
      entries.map((entry) => entry.product_id)
    );

    return products.filter(
      (product) => !existingProductIds.has(product.id)
    );
  }, [entries, products]);

  const availableProductCategories = useMemo(() => {
    const existingNames = new Set(
      categories.map((category) => category.name.trim().toLowerCase())
    );

    const uniqueNames = new Set<string>();

    products.forEach((product) => {
      const name = product.category?.trim();

      if (name && !existingNames.has(name.toLowerCase())) {
        uniqueNames.add(name);
      }
    });

    return Array.from(uniqueNames).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [categories, products]);

  const getErrorMessage = (err: any) =>
    err?.response?.data?.detail || "Something went wrong. Please try again.";

  // Load Hero Carousel and Popular Categories data
  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const [heroResponse, productsResponse, categoriesResponse] =
        await Promise.all([
          api.get("/homepage/hero/admin"),
          api.get("/products/"),
          api.get("/categories/"),
        ]);

      setEntries(
        [...heroResponse.data].sort(
          (a: HeroEntry, b: HeroEntry) =>
            a.display_order - b.display_order || a.id - b.id
        )
      );

      setProducts(productsResponse.data);

      const sortedCategories = [...categoriesResponse.data].sort(
        (a: Category, b: Category) =>
          a.popular_display_order - b.popular_display_order ||
          a.name.localeCompare(b.name)
      );

      setCategories(sortedCategories);

      setSelectedCategory((current) => {
        if (
          current &&
          sortedCategories.some(
            (category: Category) => category.name === current
          )
        ) {
          return current;
        }

        return sortedCategories[0]?.name || "";
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Load all products belonging to the selected category
  const loadPopularProducts = async (categoryName: string) => {
    if (!categoryName) {
      setPopularProducts([]);
      return;
    }

    setLoadingPopularProducts(true);

    try {
      const response = await api.get<PopularProduct[]>(
        "/products/popular-category/admin/",
        {
          params: { category: categoryName },
        }
      );

      setPopularProducts(
        [...response.data].sort(
          (a, b) =>
            a.popular_display_order - b.popular_display_order ||
            a.name.localeCompare(b.name) ||
            a.id - b.id
        )
      );
    } catch (err) {
      setError(getErrorMessage(err));
      setPopularProducts([]);
    } finally {
      setLoadingPopularProducts(false);
    }
  };

  useEffect(() => {
    loadPopularProducts(selectedCategory);
  }, [selectedCategory]);

  // Add a product to the Hero Carousel
  const addProduct = async () => {
    if (!selectedProduct) {
      setError("Please select a product first.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await api.post("/homepage/hero", {
        product_id: Number(selectedProduct),
        display_order: entries.length,
        is_visible: true,
      });

      setSelectedProduct("");
      setSuccess("Product added to the hero carousel.");
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // Toggle Hero Carousel product visibility
  const toggleVisibility = async (entry: HeroEntry) => {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await api.put(`/homepage/hero/${entry.id}`, {
        is_visible: !entry.is_visible,
      });

      setSuccess(
        !entry.is_visible
          ? "Product is now visible in the carousel."
          : "Product is now hidden from the carousel."
      );

      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // Remove a product from the Hero Carousel
  const removeProduct = async (entry: HeroEntry) => {
    const confirmed = window.confirm(
      `Remove "${entry.product.name}" from the hero carousel? The actual product will not be deleted.`
    );

    if (!confirmed) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await api.delete(`/homepage/hero/${entry.id}`);
      setSuccess("Product removed from the hero carousel.");
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // Reorder Hero Carousel products
  const moveProduct = async (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;

    if (newIndex < 0 || newIndex >= entries.length) return;

    const reordered = [...entries];

    [reordered[index], reordered[newIndex]] = [
      reordered[newIndex],
      reordered[index],
    ];

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await api.put("/homepage/hero/reorder", {
        entry_ids: reordered.map((entry) => entry.id),
      });

      setEntries(
        reordered.map((entry, position) => ({
          ...entry,
          display_order: position,
        }))
      );

      setSuccess("Carousel order updated.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // Add a category using an existing product category or a new name
  const addPopularCategory = async () => {
    const categoryName =
      categoryNameMode === "existing"
        ? selectedProductCategory.trim()
        : newCategoryName.trim();

    if (!categoryName) {
      setError(
        categoryNameMode === "existing"
          ? "Please select an existing product category."
          : "Please enter a category name."
      );
      return;
    }

    const alreadyExists = categories.some(
      (category) =>
        category.name.trim().toLowerCase() ===
        categoryName.toLowerCase()
    );

    if (alreadyExists) {
      setError("This category already exists in Category Management.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await api.post("/categories/", {
        name: categoryName,
        show_in_popular: false,
        popular_display_order: categories.length,
      });

      setSelectedProductCategory("");
      setNewCategoryName("");
      setSuccess(
        `"${categoryName}" has been added. You can now enable it in Popular Categories.`
      );

      await loadData();
      setSelectedCategory(categoryName);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // Toggle Popular Categories visibility
  const togglePopularCategory = async (category: Category) => {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await api.put(`/categories/${category.id}`, {
        show_in_popular: !category.show_in_popular,
      });

      setSuccess(
        !category.show_in_popular
          ? `"${category.name}" is now visible in Popular Categories.`
          : `"${category.name}" is now hidden from Popular Categories.`
      );

      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // Reorder Popular Categories
  const movePopularCategory = async (
    index: number,
    direction: -1 | 1
  ) => {
    const newIndex = index + direction;

    if (newIndex < 0 || newIndex >= categories.length) return;

    const reordered = [...categories];

    [reordered[index], reordered[newIndex]] = [
      reordered[newIndex],
      reordered[index],
    ];

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await Promise.all(
        reordered.map((category, position) =>
          api.put(`/categories/${category.id}`, {
            popular_display_order: position,
          })
        )
      );

      setCategories(
        reordered.map((category, position) => ({
          ...category,
          popular_display_order: position,
        }))
      );

      setSuccess("Popular Categories order updated.");
    } catch (err) {
      setError(getErrorMessage(err));
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  // Reorder products within the selected Popular Category
  const movePopularProduct = async (
    index: number,
    direction: -1 | 1
  ) => {
    const newIndex = index + direction;

    if (newIndex < 0 || newIndex >= popularProducts.length) return;
    if (!selectedCategory) return;

    const reordered = [...popularProducts];

    [reordered[index], reordered[newIndex]] = [
      reordered[newIndex],
      reordered[index],
    ];

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const params = new URLSearchParams();
      params.append("category", selectedCategory);

      reordered.forEach((product) => {
        params.append("product_ids", String(product.id));
      });

      await api.put(
        `/products/popular-category/reorder/?${params.toString()}`
      );

      setPopularProducts(
        reordered.map((product, position) => ({
          ...product,
          popular_display_order: position,
        }))
      );

      setSuccess(
        `Product order for "${selectedCategory}" updated.`
      );
    } catch (err) {
      setError(getErrorMessage(err));
      await loadPopularProducts(selectedCategory);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Homepage Management
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your homepage hero carousel and Popular Categories section.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* HERO CAROUSEL MANAGEMENT */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">
          Add Product to Hero Carousel
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Select a product already available in your product catalogue.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <select
            value={selectedProduct}
            onChange={(event) => setSelectedProduct(event.target.value)}
            className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-amber-500"
          >
            <option value="">Select a product</option>

            {availableProductsToAdd.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} — ₹{product.price}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={addProduct}
            disabled={saving || !selectedProduct}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={17} />
            Add Product
          </button>
        </div>

        {availableProductsToAdd.length === 0 && (
          <p className="mt-3 text-xs text-slate-500">
            All products are already added to the carousel.
          </p>
        )}
      </section>

      {/* HERO CAROUSEL PRODUCTS */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Hero Carousel Products
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Change visibility or use the arrows to arrange the display order.
            </p>
          </div>

          <button
            type="button"
            onClick={loadData}
            disabled={loading || saving}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500">
            Loading homepage products...
          </div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center">
            <ImageOff className="mx-auto text-slate-400" size={35} />
            <p className="mt-3 font-medium text-slate-700">
              No hero products added yet.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Add a product above to display it in the homepage carousel.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {entries.map((entry, index) => (
              <div
                key={entry.id}
                className="flex flex-col gap-4 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                    {index + 1}
                  </span>

                  {entry.product.image_url ? (
                    <img
                      src={entry.product.image_url}
                      alt={entry.product.name}
                      className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                      <ImageOff size={22} />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-slate-800">
                    {entry.product.name}
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    {entry.product.category} · ₹{entry.product.price}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        entry.is_visible
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {entry.is_visible ? "Visible" : "Hidden"}
                    </span>

                    {!entry.product.is_available && (
                      <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                        Product unavailable
                      </span>
                    )}

                    {entry.product.stock <= 0 && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                        Out of stock
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => moveProduct(index, -1)}
                    disabled={saving || index === 0}
                    title="Move up"
                    className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                  >
                    <ArrowUp size={17} />
                  </button>

                  <button
                    type="button"
                    onClick={() => moveProduct(index, 1)}
                    disabled={saving || index === entries.length - 1}
                    title="Move down"
                    className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                  >
                    <ArrowDown size={17} />
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleVisibility(entry)}
                    disabled={saving}
                    title={entry.is_visible ? "Hide product" : "Show product"}
                    className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {entry.is_visible ? (
                      <EyeOff size={17} />
                    ) : (
                      <Eye size={17} />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => removeProduct(entry)}
                    disabled={saving}
                    title="Remove from carousel"
                    className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* POPULAR CATEGORIES MANAGEMENT */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            Popular Categories Management
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Add categories, control their visibility, and arrange their order
            on the customer homepage.
          </p>
        </div>

        {/* Add category */}
        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-semibold text-slate-800">
            Add Category
          </h3>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategoryNameMode("existing")}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                categoryNameMode === "existing"
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 bg-white text-slate-600"
              }`}
            >
              Existing Product Category
            </button>

            <button
              type="button"
              onClick={() => setCategoryNameMode("new")}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                categoryNameMode === "new"
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 bg-white text-slate-600"
              }`}
            >
              + Create New Category
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            {categoryNameMode === "existing" ? (
              <select
                value={selectedProductCategory}
                onChange={(event) =>
                  setSelectedProductCategory(event.target.value)
                }
                className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-amber-500"
              >
                <option value="">Select an existing product category</option>
                {availableProductCategories.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder="Enter new category name"
                className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-amber-500"
              />
            )}

            <button
              type="button"
              onClick={addPopularCategory}
              disabled={
                saving ||
                (categoryNameMode === "existing"
                  ? !selectedProductCategory
                  : !newCategoryName.trim())
              }
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={17} />
              Add Category
            </button>
          </div>

          {categoryNameMode === "existing" &&
            availableProductCategories.length === 0 && (
              <p className="mt-2 text-xs text-slate-500">
                There are no unused product categories available. You can
                create a new category instead.
              </p>
            )}
        </div>

        {/* Category order and visibility */}
        <div className="mt-5">
          <h3 className="font-semibold text-slate-800">
            Categories
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Use the arrows to change category order. Hidden categories remain
            available here for future use.
          </p>

          {loading ? (
            <div className="py-8 text-center text-sm text-slate-500">
              Loading categories...
            </div>
          ) : categories.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              No categories found. Add a category above.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {categories.map((category, index) => (
                <div
                  key={category.id}
                  className={`flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center ${
                    category.show_in_popular
                      ? "border-amber-200 bg-amber-50/40"
                      : "border-slate-200"
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                    {index + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800">
                      {category.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {category.is_active ? "Active" : "Inactive"} ·{" "}
                      {category.show_in_popular
                        ? "Shown in Popular Categories"
                        : "Hidden from Popular Categories"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => movePopularCategory(index, -1)}
                      disabled={saving || index === 0}
                      title="Move category up"
                      className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-white disabled:opacity-30"
                    >
                      <ArrowUp size={17} />
                    </button>

                    <button
                      type="button"
                      onClick={() => movePopularCategory(index, 1)}
                      disabled={saving || index === categories.length - 1}
                      title="Move category down"
                      className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-white disabled:opacity-30"
                    >
                      <ArrowDown size={17} />
                    </button>

                    <button
                      type="button"
                      onClick={() => togglePopularCategory(category)}
                      disabled={saving}
                      title={
                        category.show_in_popular
                          ? "Hide category"
                          : "Show category"
                      }
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-white disabled:opacity-50"
                    >
                      {category.show_in_popular ? (
                        <>
                          <EyeOff size={16} />
                          Hide
                        </>
                      ) : (
                        <>
                          <Eye size={16} />
                          Show
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Products inside selected category */}
        <div className="mt-8 border-t border-slate-200 pt-6">
          <h3 className="font-semibold text-slate-800">
            Reorder Products Within a Category
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Select a category and use the arrows to arrange its products in
            the customer homepage carousel.
          </p>

          <div className="mt-4">
            <select
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              disabled={categories.length === 0}
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-amber-500 sm:max-w-md"
            >
              {categories.length === 0 ? (
                <option value="">No categories available</option>
              ) : (
                categories.map((category) => (
                  <option key={category.id} value={category.name}>
                    {category.name}
                    {category.show_in_popular ? "" : " (Hidden)"}
                  </option>
                ))
              )}
            </select>
          </div>

          {loadingPopularProducts ? (
            <div className="py-8 text-center text-sm text-slate-500">
              Loading category products...
            </div>
          ) : !selectedCategory ? (
            <div className="py-8 text-center text-sm text-slate-500">
              Select a category to manage its products.
            </div>
          ) : popularProducts.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              No products found in "{selectedCategory}".
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {popularProducts.map((product, index) => (
                <div
                  key={product.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                    {index + 1}
                  </span>

                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                      <ImageOff size={20} />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800">
                      {product.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Stock: {product.stock}
                      {product.sku ? ` · SKU: ${product.sku}` : ""}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          product.is_available
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {product.is_available ? "Available" : "Unavailable"}
                      </span>

                      {product.stock <= 0 && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                          Out of stock
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:justify-end">
                    <button
                      type="button"
                      onClick={() => movePopularProduct(index, -1)}
                      disabled={saving || index === 0}
                      title="Move product up"
                      className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                    >
                      <ArrowUp size={17} />
                    </button>

                    <button
                      type="button"
                      onClick={() => movePopularProduct(index, 1)}
                      disabled={
                        saving || index === popularProducts.length - 1
                      }
                      title="Move product down"
                      className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                    >
                      <ArrowDown size={17} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default Homepage;