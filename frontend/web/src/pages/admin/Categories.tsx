
import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";

interface Category {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  show_on_home: boolean;
  display_order: number;
  show_in_popular: boolean;
  popular_display_order: number;
  created_at?: string | null;
  updated_at?: string | null;
}

interface PopularProduct {
  id: number;
  name: string;
  sku?: string | null;
  stock: number;
  is_available: boolean;
  popular_display_order: number;
  image_url?: string | null;
}

interface ProductCategorySource {
  category?: string | null;
}

interface CategoryForm {
  name: string;
  description: string;
  image_url: string;
  is_active: boolean;
  show_on_home: boolean;
  display_order: string;
  show_in_popular: boolean;
  popular_display_order: string;
}

const emptyForm: CategoryForm = {
  name: "",
  description: "",
  image_url: "",
  is_active: true,
  show_on_home: false,
  display_order: "0",
  show_in_popular: false,
  popular_display_order: "0",
};

export default function Categories() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<Category | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);

  // Product categories for the Add New Category dropdown
  const [productCategories, setProductCategories] =
    useState<string[]>([]);
  const [productCategoriesLoading, setProductCategoriesLoading] =
    useState(false);
  const [categoryNameMode, setCategoryNameMode] =
    useState<"existing" | "new">("existing");

  // Popular category and product ordering
  const [selectedPopularCategoryId, setSelectedPopularCategoryId] =
    useState("");

  const [popularProducts, setPopularProducts] =
    useState<PopularProduct[]>([]);

  const [popularProductsLoading, setPopularProductsLoading] =
    useState(false);

  const [savingCategoryOrder, setSavingCategoryOrder] =
    useState(false);

  const [savingProductOrder, setSavingProductOrder] =
    useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!user || !["admin", "super_admin"].includes(user.role)) {
      navigate("/login", { replace: true });
      return;
    }

    loadCategories();
  }, [user, authLoading]);

  const loadCategories = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get<Category[]>("/categories/");
      setCategories(response.data);
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Unable to load categories."
      );
    } finally {
      setLoading(false);
    }
  };

  const filteredCategories = useMemo(() => {
    return categories.filter((category) => {
      const matchesSearch =
        category.name.toLowerCase().includes(search.toLowerCase()) ||
        (category.description || "")
          .toLowerCase()
          .includes(search.toLowerCase());

      const matchesFilter =
        filter === "all" ||
        (filter === "active" && category.is_active) ||
        (filter === "inactive" && !category.is_active) ||
        (filter === "homepage" && category.show_on_home) ||
        (filter === "popular" && category.show_in_popular);

      return matchesSearch && matchesFilter;
    });
  }, [categories, search, filter]);

  // Remove product categories that already exist in Category Management.
  const availableProductCategories = useMemo(() => {
    const existingNames = new Set(
      categories.map((category) => category.name.trim().toLowerCase())
    );

    return productCategories.filter(
      (name) => !existingNames.has(name.trim().toLowerCase())
    );
  }, [productCategories, categories]);

  const updateField = (
    field: keyof CategoryForm,
    value: string | boolean
  ) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const loadProductCategories = async () => {
    setProductCategoriesLoading(true);

    try {
      const response = await api.get<ProductCategorySource[]>("/products/");

      const uniqueCategories = Array.from(
        new Set(
          response.data
            .map((product) => product.category?.trim())
            .filter(
              (category): category is string =>
                Boolean(category)
            )
        )
      ).sort((a, b) => a.localeCompare(b));

      setProductCategories(uniqueCategories);

      // Automatically select the first available category.
      const existingNames = new Set(
        categories.map((category) =>
          category.name.trim().toLowerCase()
        )
      );

      const available = uniqueCategories.filter(
        (name) => !existingNames.has(name.toLowerCase())
      );

      if (available.length > 0) {
        setCategoryNameMode("existing");
        setForm((previous) => ({
          ...previous,
          name: available[0],
        }));
      } else {
        setCategoryNameMode("new");
        setForm((previous) => ({
          ...previous,
          name: "",
        }));
      }
    } catch (err: any) {
      console.error("Unable to load product categories:", err);
      setProductCategories([]);
      setCategoryNameMode("new");
      setForm((previous) => ({
        ...previous,
        name: "",
      }));
    } finally {
      setProductCategoriesLoading(false);
    }
  };

  const openAddForm = () => {
    setEditingCategory(null);
    setForm(emptyForm);
    setCategoryNameMode("existing");
    setShowForm(true);
    setError("");
    setSuccess("");

    loadProductCategories();
  };

  const openEditForm = (category: Category) => {
    setEditingCategory(category);
    setCategoryNameMode("new");

    setForm({
      name: category.name,
      description: category.description || "",
      image_url: category.image_url || "",
      is_active: category.is_active,
      show_on_home: category.show_on_home ?? false,
      display_order: String(category.display_order ?? 0),
      show_in_popular: category.show_in_popular ?? false,
      popular_display_order: String(
        category.popular_display_order ?? 0
      ),
    });

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

      updateField("image_url", response.data.image_url);
      setSuccess("Category image uploaded successfully.");
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

      console.error("Category image upload error:", err);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("Please select or enter a category name.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const categoryData = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      image_url: form.image_url.trim() || null,
      is_active: form.is_active,
      show_on_home: form.show_on_home,
      display_order: Number(form.display_order || 0),
      show_in_popular: form.show_in_popular,
      popular_display_order: Number(
        form.popular_display_order || 0
      ),
    };

    try {
      if (editingCategory) {
        await api.put(
          `/categories/${editingCategory.id}`,
          categoryData
        );

        setSuccess("Category updated successfully.");
      } else {
        await api.post("/categories/", categoryData);
        setSuccess("Category added successfully.");
      }

      setShowForm(false);
      setEditingCategory(null);
      setForm(emptyForm);

      await loadCategories();
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Unable to save category."
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (category: Category) => {
    setError("");
    setSuccess("");

    try {
      await api.patch(
        `/categories/${category.id}/status`,
        null,
        {
          params: {
            is_active: !category.is_active,
          },
        }
      );

      setSuccess(
        `Category ${category.is_active ? "deactivated" : "activated"} successfully.`
      );

      await loadCategories();
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          "Unable to update category status."
      );
    }
  };

  const toggleHomepageSetting = async (
    category: Category,
    setting: "show_on_home" | "show_in_popular"
  ) => {
    setError("");
    setSuccess("");

    try {
      await api.put(`/categories/${category.id}`, {
        [setting]: !category[setting],
      });

      setSuccess("Homepage category setting updated.");
      await loadCategories();
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          "Unable to update homepage setting."
      );
    }
  };

  const handleDelete = async (category: Category) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${category.name}"?`
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      await api.delete(`/categories/${category.id}`);

      setSuccess("Category deleted successfully.");
      await loadCategories();
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          "Unable to delete category. It may be assigned to products."
      );
    }
  };

  // --------------------------------------------------
  // POPULAR CATEGORY ORDERING
  // --------------------------------------------------

  const popularOrderCategories = useMemo(() => {
    return categories
      .filter(
        (category) =>
          category.is_active && category.show_in_popular
      )
      .sort(
        (a, b) =>
          a.popular_display_order - b.popular_display_order ||
          a.id - b.id
      );
  }, [categories]);

  const movePopularCategory = async (
    index: number,
    direction: "up" | "down"
  ) => {
    const newIndex = direction === "up" ? index - 1 : index + 1;

    if (
      newIndex < 0 ||
      newIndex >= popularOrderCategories.length ||
      savingCategoryOrder
    ) {
      return;
    }

    const reordered = [...popularOrderCategories];

    [reordered[index], reordered[newIndex]] = [
      reordered[newIndex],
      reordered[index],
    ];

    const updatedCategories = reordered.map(
      (category, position) => ({
        ...category,
        popular_display_order: position,
      })
    );

    setSavingCategoryOrder(true);
    setError("");
    setSuccess("");

    try {
      await Promise.all(
        updatedCategories.map((category) =>
          api.put(`/categories/${category.id}`, {
            popular_display_order: category.popular_display_order,
          })
        )
      );

      setCategories((previous) =>
        previous.map((category) => {
          const updated = updatedCategories.find(
            (item) => item.id === category.id
          );

          return updated || category;
        })
      );

      setSuccess("Popular category order saved successfully.");
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          "Unable to save popular category order."
      );

      await loadCategories();
    } finally {
      setSavingCategoryOrder(false);
    }
  };

  // --------------------------------------------------
  // SELECTED CATEGORY PRODUCTS
  // --------------------------------------------------

  useEffect(() => {
    if (!selectedPopularCategoryId) {
      setPopularProducts([]);
      return;
    }

    const category = popularOrderCategories.find(
      (item) => item.id === Number(selectedPopularCategoryId)
    );

    if (!category) {
      setPopularProducts([]);
      return;
    }

    let cancelled = false;

    const fetchPopularProducts = async () => {
      setPopularProductsLoading(true);
      setError("");

      try {
        const response = await api.get<PopularProduct[]>(
          "/products/popular-category/admin/",
          {
            params: {
              category: category.name,
            },
          }
        );

        if (!cancelled) {
          setPopularProducts(response.data);
        }
      } catch (err: any) {
        if (!cancelled) {
          setPopularProducts([]);
          setError(
            err.response?.data?.detail ||
              "Unable to load products for this category."
          );
        }
      } finally {
        if (!cancelled) {
          setPopularProductsLoading(false);
        }
      }
    };

    fetchPopularProducts();

    return () => {
      cancelled = true;
    };
  }, [selectedPopularCategoryId, popularOrderCategories]);

  // Automatically select the first available popular category.
  useEffect(() => {
    if (popularOrderCategories.length === 0) {
      setSelectedPopularCategoryId("");
      return;
    }

    const selectedStillExists = popularOrderCategories.some(
      (category) =>
        category.id === Number(selectedPopularCategoryId)
    );

    if (!selectedStillExists) {
      setSelectedPopularCategoryId(
        String(popularOrderCategories[0].id)
      );
    }
  }, [popularOrderCategories, selectedPopularCategoryId]);

  // --------------------------------------------------
  // POPULAR CATEGORY PRODUCT ORDERING
  // --------------------------------------------------

  const movePopularProduct = (
    index: number,
    direction: "up" | "down"
  ) => {
    const newIndex = direction === "up" ? index - 1 : index + 1;

    if (
      newIndex < 0 ||
      newIndex >= popularProducts.length ||
      savingProductOrder
    ) {
      return;
    }

    setPopularProducts((previous) => {
      const reordered = [...previous];

      [reordered[index], reordered[newIndex]] = [
        reordered[newIndex],
        reordered[index],
      ];

      return reordered;
    });
  };

  const savePopularProductOrder = async () => {
    const category = popularOrderCategories.find(
      (item) => item.id === Number(selectedPopularCategoryId)
    );

    if (
      !category ||
      savingProductOrder ||
      popularProductsLoading
    ) {
      return;
    }

    setSavingProductOrder(true);
    setError("");
    setSuccess("");

    try {
      const params = new URLSearchParams();

      params.set("category", category.name);

      popularProducts.forEach((product) => {
        params.append("product_ids", String(product.id));
      });

      await api.put(
        `/products/popular-category/reorder/?${params.toString()}`
      );

      setSuccess(
        `Product order for "${category.name}" saved successfully.`
      );
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          "Unable to save product order."
      );
    } finally {
      setSavingProductOrder(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-gray-600">
        Loading categories...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      {/* PAGE HEADING */}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#101B2D]">
            Category Management
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Create categories and control how they appear on your homepage.
          </p>
        </div>

        <button
          onClick={openAddForm}
          className="rounded-lg bg-[#101B2D] px-5 py-3 font-semibold text-white transition hover:bg-[#1C2B42]"
        >
          + Add Category
        </button>
      </div>

      {/* ALERTS */}

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

      {/* SUMMARY CARDS */}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Total Categories"
          value={categories.length}
        />

        <SummaryCard
          label="Active Categories"
          value={categories.filter((c) => c.is_active).length}
        />

        <SummaryCard
          label="Shop by Category"
          value={categories.filter((c) => c.show_on_home).length}
        />

        <SummaryCard
          label="Popular Categories"
          value={categories.filter((c) => c.show_in_popular).length}
        />
      </div>

      {/* POPULAR CATEGORY AND PRODUCT ORDERING */}

      <div className="mb-8 space-y-6">
        {/* CATEGORY ORDER */}

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h3 className="text-lg font-bold text-[#101B2D]">
              Popular Categories Order
            </h3>

            <p className="mt-1 text-sm text-gray-500">
              Change the order in which categories appear on the customer homepage.
            </p>
          </div>

          {popularOrderCategories.length === 0 ? (
            <p className="rounded-lg bg-[#F7F5EF] p-4 text-sm text-gray-500">
              No active categories are currently enabled in Popular Categories.
              Enable a category using the Popular visibility setting below.
            </p>
          ) : (
            <div className="space-y-2">
              {popularOrderCategories.map((category, index) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F7F5EF] text-sm font-bold text-[#101B2D]">
                      {index + 1}
                    </span>

                    {category.image_url ? (
                      <img
                        src={category.image_url}
                        alt={category.name}
                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F7F5EF]">
                        🏷️
                      </div>
                    )}

                    <span className="truncate font-semibold text-[#101B2D]">
                      {category.name}
                    </span>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        movePopularCategory(index, "up")
                      }
                      disabled={
                        index === 0 || savingCategoryOrder
                      }
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-bold hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={`Move ${category.name} up`}
                    >
                      ↑
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        movePopularCategory(index, "down")
                      }
                      disabled={
                        index === popularOrderCategories.length - 1 ||
                        savingCategoryOrder
                      }
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-bold hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={`Move ${category.name} down`}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {savingCategoryOrder && (
            <p className="mt-3 text-xs text-blue-600">
              Saving category order...
            </p>
          )}
        </div>

        {/* PRODUCT ORDER */}

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h3 className="text-lg font-bold text-[#101B2D]">
              Popular Category Product Order
            </h3>

            <p className="mt-1 text-sm text-gray-500">
              Select a popular category and arrange the products inside its homepage carousel.
            </p>
          </div>

          <div className="mb-5 max-w-md">
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              Select Popular Category
            </label>

            <select
              value={selectedPopularCategoryId}
              onChange={(event) =>
                setSelectedPopularCategoryId(event.target.value)
              }
              disabled={popularOrderCategories.length === 0}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 outline-none focus:border-[#D6B875] disabled:bg-gray-100"
            >
              {popularOrderCategories.length === 0 ? (
                <option value="">
                  No popular categories available
                </option>
              ) : (
                popularOrderCategories.map((category) => (
                  <option
                    key={category.id}
                    value={String(category.id)}
                  >
                    {category.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {popularProductsLoading ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Loading category products...
            </p>
          ) : popularProducts.length === 0 ? (
            <p className="rounded-lg bg-[#F7F5EF] p-4 text-sm text-gray-500">
              No products found in this category.
            </p>
          ) : (
            <>
              <div className="mb-4 space-y-2">
                {popularProducts.map((product, index) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F7F5EF] text-sm font-bold text-[#101B2D]">
                        {index + 1}
                      </span>

                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="h-12 w-12 shrink-0 rounded-lg border border-gray-100 object-contain"
                        />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#F7F5EF]">
                          🛍️
                        </div>
                      )}

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#101B2D]">
                          {product.name}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          Stock: {product.stock}
                          {" · "}
                          {product.is_available
                            ? "Available"
                            : "Unavailable"}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          movePopularProduct(index, "up")
                        }
                        disabled={
                          index === 0 ||
                          savingProductOrder ||
                          popularProductsLoading
                        }
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-bold hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label={`Move ${product.name} up`}
                      >
                        ↑
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          movePopularProduct(index, "down")
                        }
                        disabled={
                          index === popularProducts.length - 1 ||
                          savingProductOrder ||
                          popularProductsLoading
                        }
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-bold hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label={`Move ${product.name} down`}
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                <p className="text-xs text-gray-500">
                  Changes are not applied to the homepage until you save.
                </p>

                <button
                  type="button"
                  onClick={savePopularProductOrder}
                  disabled={
                    savingProductOrder || popularProductsLoading
                  }
                  className="rounded-lg bg-[#101B2D] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1C2B42] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingProductOrder
                    ? "Saving..."
                    : "Save Product Order"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* SEARCH AND FILTER */}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search categories..."
          className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 outline-none focus:border-[#D6B875]"
        />

        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-4 py-3"
        >
          <option value="all">All categories</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="homepage">Shown on homepage</option>
          <option value="popular">Popular categories</option>
        </select>
      </div>

      {/* CATEGORY TABLE */}

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="bg-[#101B2D] text-white">
            <tr>
              <th className="p-4">Category</th>
              <th className="p-4">Status</th>
              <th className="p-4">Shop by Category</th>
              <th className="p-4">Popular</th>
              <th className="p-4">Display Order</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredCategories.map((category) => (
              <tr
                key={category.id}
                className="border-b border-gray-100 last:border-0"
              >
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    {category.image_url ? (
                      <img
                        src={category.image_url}
                        alt={category.name}
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                        className="h-12 w-12 rounded-lg border border-gray-100 object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#F7F5EF] text-xl">
                        🏷️
                      </div>
                    )}

                    <div>
                      <p className="font-semibold text-[#101B2D]">
                        {category.name}
                      </p>

                      <p className="max-w-xs truncate text-xs text-gray-500">
                        {category.description || "No description"}
                      </p>
                    </div>
                  </div>
                </td>

                <td className="p-4">
                  <button
                    onClick={() => toggleStatus(category)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      category.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {category.is_active ? "Active" : "Inactive"}
                  </button>
                </td>

                <td className="p-4">
                  <button
                    onClick={() =>
                      toggleHomepageSetting(category, "show_on_home")
                    }
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      category.show_on_home
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {category.show_on_home ? "Visible" : "Hidden"}
                  </button>
                </td>

                <td className="p-4">
                  <button
                    onClick={() =>
                      toggleHomepageSetting(category, "show_in_popular")
                    }
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      category.show_in_popular
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {category.show_in_popular ? "Visible" : "Hidden"}
                  </button>
                </td>

                <td className="p-4">
                  <p className="text-xs text-gray-600">
                    Homepage: {category.display_order}
                  </p>
                  <p className="mt-1 text-xs text-gray-600">
                    Popular: {category.popular_display_order}
                  </p>
                </td>

                <td className="p-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditForm(category)}
                      className="rounded-lg bg-blue-50 px-3 py-2 text-blue-700 transition hover:bg-blue-100"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => handleDelete(category)}
                      className="rounded-lg bg-red-50 px-3 py-2 text-red-700 transition hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {filteredCategories.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="p-10 text-center text-gray-500"
                >
                  No categories found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ADD / EDIT CATEGORY MODAL */}

      {showForm && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/50 p-4">
          <div className="mx-auto my-6 max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-[#101B2D]">
                  {editingCategory ? "Edit Category" : "Add New Category"}
                </h2>

                <p className="mt-1 text-xs text-gray-500">
                  Configure category details and homepage visibility.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-2xl text-gray-500 hover:text-gray-800"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-5">
              {/* BASIC DETAILS */}

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Category Name *">
                  {editingCategory ? (
                    <input
                      required
                      minLength={2}
                      maxLength={100}
                      value={form.name}
                      onChange={(event) =>
                        updateField("name", event.target.value)
                      }
                      placeholder="e.g. Beverages"
                      className="form-input"
                    />
                  ) : (
                    <>
                      <div className="mb-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCategoryNameMode("existing");
                            updateField(
                              "name",
                              availableProductCategories[0] || ""
                            );
                          }}
                          className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                            categoryNameMode === "existing"
                              ? "bg-[#101B2D] text-white"
                              : "border border-gray-300 text-gray-700"
                          }`}
                        >
                          Existing Product Category
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setCategoryNameMode("new");
                            updateField("name", "");
                          }}
                          className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                            categoryNameMode === "new"
                              ? "bg-[#101B2D] text-white"
                              : "border border-gray-300 text-gray-700"
                          }`}
                        >
                          + Create New Category
                        </button>
                      </div>

                      {categoryNameMode === "existing" ? (
                        <>
                          <select
                            required
                            value={form.name}
                            onChange={(event) =>
                              updateField("name", event.target.value)
                            }
                            disabled={
                              productCategoriesLoading ||
                              availableProductCategories.length === 0
                            }
                            className="form-input"
                          >
                            {productCategoriesLoading ? (
                              <option value="">
                                Loading product categories...
                              </option>
                            ) : availableProductCategories.length === 0 ? (
                              <option value="">
                                No unused product categories available
                              </option>
                            ) : (
                              <>
                                <option value="">
                                  Select a product category
                                </option>

                                {availableProductCategories.map(
                                  (categoryName) => (
                                    <option
                                      key={categoryName}
                                      value={categoryName}
                                    >
                                      {categoryName}
                                    </option>
                                  )
                                )}
                              </>
                            )}
                          </select>

                          <p className="mt-2 text-xs text-gray-500">
                            Choose a category name already used by your products.
                          </p>

                          {availableProductCategories.length === 0 &&
                            !productCategoriesLoading && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCategoryNameMode("new");
                                  updateField("name", "");
                                }}
                                className="mt-2 text-xs font-semibold text-blue-700 hover:underline"
                              >
                                Create a brand-new category instead
                              </button>
                            )}
                        </>
                      ) : (
                        <>
                          <input
                            required
                            minLength={2}
                            maxLength={100}
                            value={form.name}
                            onChange={(event) =>
                              updateField("name", event.target.value)
                            }
                            placeholder="Enter a new category name"
                            className="form-input"
                          />

                          <p className="mt-2 text-xs text-gray-500">
                            Enter a category name that is not currently used.
                          </p>
                        </>
                      )}
                    </>
                  )}
                </FormField>

                <FormField label="Category Image">
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp"
                    onChange={handleImageUpload}
                    className="w-full text-sm"
                  />

                  {uploading && (
                    <p className="mt-2 text-xs text-blue-600">
                      Uploading image...
                    </p>
                  )}

                  {form.image_url && (
                    <div className="mt-3 flex items-center gap-3">
                      <img
                        src={form.image_url}
                        alt="Category preview"
                        className="h-16 w-16 rounded-lg border object-cover"
                      />

                      <button
                        type="button"
                        onClick={() => updateField("image_url", "")}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Remove image
                      </button>
                    </div>
                  )}
                </FormField>
              </div>

              <FormField label="Description">
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(event) =>
                    updateField("description", event.target.value)
                  }
                  placeholder="Write a short category description..."
                  className="form-input"
                />
              </FormField>

              {/* CATEGORY STATUS */}

              <div className="rounded-xl border border-gray-200 p-4">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(event) =>
                      updateField("is_active", event.target.checked)
                    }
                    className="h-4 w-4 accent-[#101B2D]"
                  />

                  <div>
                    <p className="font-semibold text-[#101B2D]">
                      Category is active
                    </p>

                    <p className="text-xs text-gray-500">
                      Inactive categories should not be displayed to customers.
                    </p>
                  </div>
                </label>
              </div>

              {/* SHOP BY CATEGORY SETTINGS */}

              <div className="rounded-xl border border-[#D6B875] bg-[#F7F5EF] p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={form.show_on_home}
                    onChange={(event) =>
                      updateField("show_on_home", event.target.checked)
                    }
                    className="mt-1 h-4 w-4 accent-[#101B2D]"
                  />

                  <div className="flex-1">
                    <p className="font-semibold text-[#101B2D]">
                      Show in Shop by Category
                    </p>

                    <p className="mt-1 text-xs text-gray-600">
                      Display this category in the homepage category section.
                    </p>

                    {form.show_on_home && (
                      <div className="mt-3 max-w-xs">
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          Homepage display order
                        </label>

                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={form.display_order}
                          onChange={(event) =>
                            updateField("display_order", event.target.value)
                          }
                          className="form-input"
                        />
                      </div>
                    )}
                  </div>
                </label>
              </div>

              {/* POPULAR CATEGORY SETTINGS */}

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={form.show_in_popular}
                    onChange={(event) =>
                      updateField("show_in_popular", event.target.checked)
                    }
                    className="mt-1 h-4 w-4 accent-[#101B2D]"
                  />

                  <div className="flex-1">
                    <p className="font-semibold text-[#101B2D]">
                      Show in Popular Categories
                    </p>

                    <p className="mt-1 text-xs text-gray-500">
                      Display this category in the homepage popular section.
                    </p>

                    {form.show_in_popular && (
                      <div className="mt-3 max-w-xs">
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          Popular section display order
                        </label>

                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={form.popular_display_order}
                          onChange={(event) =>
                            updateField(
                              "popular_display_order",
                              event.target.value
                            )
                          }
                          className="form-input"
                        />
                      </div>
                    )}
                  </div>
                </label>
              </div>

              {/* FORM ACTIONS */}

              <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    saving ||
                    uploading ||
                    productCategoriesLoading
                  }
                  className="rounded-lg bg-[#101B2D] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#1C2B42] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving
                    ? "Saving..."
                    : editingCategory
                      ? "Update Category"
                      : "Add Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-[#101B2D]">{value}</p>
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
