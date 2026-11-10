import { useEffect, useMemo, useState } from "react";
import type { MouseEvent, KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";

import api from "../../services/api";
import type { Product } from "../../types/product";
import { useCart } from "../../context/CartContext";
import type { PurchaseMode } from "../../context/CartContext";
import { useTheme } from "../../hooks/useTheme";
// import SiteHeader from "../../components/customer/SiteHeader";

// --------------------------------------------------
// TYPES
// --------------------------------------------------

interface Brand {
  id: number;
  name: string;
  description: string | null;
  logo_url: string | null;
  is_active: boolean;
  show_on_home: boolean;
  display_order: number;
}

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
}

type HomeProduct = Product & {
  brand_id?: number | null;
  created_at?: string;
};

interface HeroEntry {
  id: number;
  product_id: number;
  display_order: number;
  is_visible: boolean;
  product: HomeProduct;
}

interface PopularCategoryRow {
  category: Category;
  products: HomeProduct[];
}

// --------------------------------------------------
// CONSTANTS
// --------------------------------------------------

// Path to your custom logo (e.g. "/logo.png"). Leave empty to show the "G" tile.
const LOGO_SRC = "";

const DISCRETE_UNITS = ["piece", "packet", "bottle"];
const MEASUREMENT_UNITS = ["kg", "g", "litre", "ml"];

// Light + dark theme classes (needs Tailwind dark mode set to "class").
const UI = {
  page: "bg-[#F7F5EF] dark:bg-[#0B1220]",
  surface: "bg-white dark:bg-[#162238]",
  tile: "bg-[#F1F0EB] dark:bg-[#24324D]",
  text: "text-[#101B2D] dark:text-[#F2EFE6]",
  muted: "text-gray-500 dark:text-[#9AA3B2]",
  faint: "text-gray-400 dark:text-[#9AA3B2]",
  gold: "text-[#8A6D2F] dark:text-[#D6B875]",
  border: "border-gray-100 dark:border-white/10",
  field: "border-gray-300 bg-white dark:border-white/15 dark:bg-[#162238]",
  active:
    "border-[#101B2D] bg-[#101B2D] text-white dark:border-[#D6B875] dark:bg-[#D6B875] dark:text-[#101B2D]",
};

const formatPrice = (value: number) =>
  `₹${value.toFixed(2)}`;

const getDiscountedPrice = (product: Product) => {
  const price = Number(product.price);
  const discounted = Number(product.discounted_price);

  if (discounted > 0) return discounted;

  const discount = Number(product.discount_percentage || 0);
  return Number((price * (1 - discount / 100)).toFixed(2));
};

const scrollToId = (id: string) => {
  document.getElementById(id)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
};

// --------------------------------------------------
// SECTION HEADING
// --------------------------------------------------

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-8">
      <p className={`text-xs font-semibold uppercase tracking-[0.18em] sm:text-sm ${UI.gold}`}>
        {eyebrow}
      </p>

      <h2 className={`mt-2 font-serif text-2xl font-bold sm:text-4xl ${UI.text}`}>
        {title}
      </h2>

      {description && (
        <p className={`mt-2 text-sm sm:text-base ${UI.muted}`}>
          {description}
        </p>
      )}
    </div>
  );
}

// --------------------------------------------------
// PRODUCT CARD
// --------------------------------------------------

function ProductCard({ product }: { product: Product }) {
  const navigate = useNavigate();
  const { addToCart } = useCart();

  const [mode, setMode] = useState<PurchaseMode>("quantity");
  const [value, setValue] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const price = Number(product.price);
  const discount = Number(product.discount_percentage || 0);
  const discountedPrice = getDiscountedPrice(product);
  const unit = product.unit.toLowerCase();

  const isDiscrete = DISCRETE_UNITS.includes(unit);

  const canBuyByAmount =
    product.allow_purchase_by_amount &&
    MEASUREMENT_UNITS.includes(unit);

  const estimatedQuantity =
    discountedPrice > 0 ? value / discountedPrice : 0;

  const increaseValue = () => {
    if (mode === "quantity") {
      setValue((current) =>
        Math.min(Math.floor(product.stock), current + 1)
      );
    } else {
      setValue((current) => current + 1);
    }
  };

  const decreaseValue = () => {
    setValue((current) => Math.max(1, current - 1));
  };

  // Open product details when the card is clicked.
  const openProductDetails = () => {
    navigate(`/products/${product.id}`);
  };

  // Support Enter and Space keyboard navigation.
  const handleCardKeyDown = (
    event: KeyboardEvent<HTMLElement>
  ) => {
    if (event.target !== event.currentTarget) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openProductDetails();
    }
  };

  // Add product without triggering card navigation.
  const handleAddToCart = async (
    event: MouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();

    if (value <= 0 || !Number.isFinite(value)) {
      alert("Please enter a valid value.");
      return;
    }

    if (!Number.isInteger(value)) {
      alert(
        mode === "amount"
          ? "Please enter a whole-number rupee amount."
          : "Please enter a whole-number quantity."
      );
      return;
    }

    if (mode === "quantity" && value > product.stock) {
      alert(`Available stock: ${product.stock} ${product.unit}.`);
      return;
    }

    if (isAdding) return;

    const rect = event.currentTarget.getBoundingClientRect();

    try {
      setIsAdding(true);

      await addToCart(product, mode, value);

      // Same event as before: your existing add-to-cart sparkle listens for it.
      window.dispatchEvent(
        new CustomEvent("gmart:add-to-cart", {
          detail: {
            productName: product.name,
            message:
              mode === "amount"
                ? `Amount: ${formatPrice(value)}`
                : `Quantity: ${value} ${product.unit}`,
            startX: rect.left + rect.width / 2,
            startY: rect.top + rect.height / 2,
          },
        })
      );
    } catch (error) {
      console.error("Add to cart error:", error);
      alert("Unable to add this product to cart. Please try again.");
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <article
      role="link"
      tabIndex={0}
      aria-label={`View details for ${product.name}`}
      onClick={openProductDetails}
      onKeyDown={handleCardKeyDown}
      className={`group cursor-pointer overflow-hidden rounded-2xl border shadow-sm transition duration-300 hover:-translate-y-1 hover:border-[#D6B875] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[#D6B875] ${UI.surface} ${UI.border}`}
    >
      {/* IMAGE */}

      <div className={`relative flex h-48 items-center justify-center overflow-hidden ${UI.tile}`}>
        {!imageFailed && product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            onError={() => setImageFailed(true)}
            className="h-full w-full object-contain p-4 transition duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="text-6xl">🛍️</span>
        )}

        {discount > 0 && (
          <span className="absolute right-3 top-3 rounded-md bg-red-500 px-3 py-1 text-xs font-bold text-white shadow">
            {discount}% OFF
          </span>
        )}

        {product.stock <= 0 && (
          <span className="absolute bottom-3 left-3 rounded-md bg-gray-800 px-3 py-1 text-xs font-semibold text-white">
            Sold Out
          </span>
        )}
      </div>

      {/* DETAILS */}

      <div className="p-4">
        <p className={`text-xs font-semibold uppercase tracking-wider ${UI.faint}`}>
          {product.category}
        </p>

        <h3 className={`mt-2 line-clamp-1 font-bold ${UI.text}`}>
          {product.name}
        </h3>

        <p className={`mt-1 line-clamp-2 min-h-10 text-sm ${UI.muted}`}>
          {product.description || "Everyday essential"}
        </p>

        {/* PRICE */}

        <div className="mt-3">
          <span className={`font-bold ${UI.text}`}>
            {formatPrice(discountedPrice)}
          </span>

          {discount > 0 && (
            <span className={`ml-2 text-sm line-through ${UI.faint}`}>
              {formatPrice(price)}
            </span>
          )}

          <span className={`ml-1 text-xs ${UI.muted}`}>
            / {product.unit}
          </span>
        </div>

        {/* PURCHASE CONTROLS */}

        <div onClick={(event) => event.stopPropagation()}>
          {/* PURCHASE MODE */}

          {canBuyByAmount && (
            <div className="mt-4">
              <label className={`mb-2 block text-sm font-semibold ${UI.text}`}>
                Purchase method
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode("quantity");
                    setValue(1);
                  }}
                  className={`rounded-lg border px-2 py-2 text-xs font-semibold ${
                    mode === "quantity" ? UI.active : `${UI.field} ${UI.text}`
                  }`}
                >
                  Quantity
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode("amount");
                    setValue(50);
                  }}
                  className={`rounded-lg border px-2 py-2 text-xs font-semibold ${
                    mode === "amount" ? UI.active : `${UI.field} ${UI.text}`
                  }`}
                >
                  Amount (₹)
                </button>
              </div>
            </div>
          )}

          {/* INPUT */}

          <div className="mt-4">
            <label className={`mb-2 block text-sm font-semibold ${UI.text}`}>
              {mode === "amount"
                ? "Enter amount (₹)"
                : `Enter quantity (${product.unit})`}
            </label>

            <div className={`flex items-center overflow-hidden rounded-xl border ${UI.field}`}>
              <input
                type="number"
                min="1"
                max={mode === "quantity" ? Math.floor(product.stock) : undefined}
                step="1"
                value={value}
                onChange={(event) => {
                  const inputValue = event.target.value;

                  if (inputValue === "") {
                    setValue(0);
                    return;
                  }

                  if (/^\d+$/.test(inputValue)) {
                    setValue(Number(inputValue));
                  }
                }}
                className={`w-full min-w-0 bg-transparent px-3 py-2 outline-none ${UI.text}`}
              />

              <div className="flex flex-col border-l border-gray-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={increaseValue}
                  disabled={
                    mode === "quantity" && value >= Math.floor(product.stock)
                  }
                  aria-label="Increase value"
                  className={`flex h-5 w-7 items-center justify-center text-[9px] leading-none hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-white/10 ${UI.text}`}
                >
                  ▲
                </button>

                <button
                  type="button"
                  onClick={decreaseValue}
                  disabled={value <= 1}
                  aria-label="Decrease value"
                  className={`flex h-5 w-7 items-center justify-center border-t border-gray-200 text-[9px] leading-none hover:bg-gray-100 disabled:opacity-30 dark:border-white/10 dark:hover:bg-white/10 ${UI.text}`}
                >
                  ▼
                </button>
              </div>
            </div>
          </div>

          {/* ESTIMATED QUANTITY */}

          {mode === "amount" && (
            <div className="mt-2 rounded-xl bg-[#F7F5EF] px-3 py-2 dark:bg-[#0B1220]">
              <p className={`text-xs ${UI.muted}`}>
                Estimated quantity:
              </p>

              <p className={`mt-1 text-sm font-bold ${UI.text}`}>
                {estimatedQuantity > 0
                  ? `${estimatedQuantity.toFixed(3)} ${product.unit}`
                  : `0 ${product.unit}`}
              </p>
            </div>
          )}

          {/* ADD TO CART */}

          <button
            type="button"
            disabled={
              !product.is_available ||
              product.stock <= 0 ||
              value <= 0 ||
              isAdding
            }
            onClick={handleAddToCart}
            className="mt-4 w-full rounded-xl bg-[#101B2D] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#D6B875] hover:text-[#101B2D] disabled:cursor-not-allowed disabled:bg-gray-400 dark:bg-[#D6B875] dark:text-[#101B2D] dark:hover:bg-white dark:disabled:bg-gray-600 dark:disabled:text-gray-300"
          >
            {isAdding
              ? "Adding..."
              : product.stock > 0 && product.is_available
                ? "+ Add to Cart"
                : "Sold Out"}
          </button>
        </div>

        <p className={`mt-3 text-center text-xs font-medium ${UI.gold}`}>
          View product details →
        </p>
      </div>
    </article>
  );
}

// --------------------------------------------------
// HORIZONTAL PRODUCT ROW
// --------------------------------------------------

function ProductRow({
  products,
}: {
  products: HomeProduct[];
}) {
  if (products.length === 0) {
    return (
      <p className={`py-5 text-sm ${UI.faint}`}>
        No available products in this category yet.
      </p>
    );
  }

  return (
    <div className="flex gap-5 overflow-x-auto pb-5">
      {products.map((product) => (
        <div
          key={product.id}
          className="w-64 min-w-64 flex-shrink-0 sm:w-72 sm:min-w-72"
        >
          <ProductCard product={product} />
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------
// HERO SHOWCASE (ANIMATED PRODUCT CARDS)
// --------------------------------------------------

function HeroShowcase({
  entries,
}: {
  entries: HeroEntry[];
}) {
  const navigate = useNavigate();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const count = entries.length;
  const current = count > 0 ? ((active % count) + count) % count : 0;
  const half = Math.floor(count / 2);

  // Auto-advance every 3.5 seconds (paused while hovering).
  useEffect(() => {
    if (count <= 1 || paused) return;

    const timer = window.setInterval(() => {
      setActive((value) => value + 1);
    }, 3500);

    return () => window.clearInterval(timer);
  }, [count, paused]);

  // Position of a card relative to the front card: 0, -1, +1 ...
  const offsetOf = (index: number) => {
    let distance = (index - current + count) % count;
    if (distance > half) distance -= count;
    return distance;
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <style>{`
        @keyframes gmart-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .gmart-float { animation: none !important; }
        }
      `}</style>

      <div className="absolute left-0 top-0 z-30 rounded-full border border-[#D6B875]/30 bg-[#101B2D]/80 px-4 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#D6B875] sm:text-xs">
          Fresh Picks, Just for You
        </span>
      </div>

      {/* CARD STAGE */}

      <div className="relative h-[330px] sm:h-[400px]">
        {count === 0 && (
          <div className="absolute left-1/2 top-1/2 flex h-[250px] w-[180px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border border-[#D6B875]/30 bg-white/5 text-6xl sm:h-[300px] sm:w-[220px]">
            🛍️
          </div>
        )}

        {entries.map((entry, index) => {
          const product = entry.product;
          const discount = Number(product.discount_percentage || 0);
          const distance = offsetOf(index);
          const isVisible = Math.abs(distance) <= 1;
          const side = Math.max(-1, Math.min(1, distance));

          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => navigate(`/products/${product.id}`)}
              aria-label={`View ${product.name}`}
              aria-hidden={!isVisible}
              tabIndex={isVisible ? 0 : -1}
              className="absolute left-1/2 top-1/2 w-[180px] text-left transition-all duration-700 ease-out sm:w-[220px]"
              style={{
                transform: `translate(calc(-50% + ${side * 68}%), -50%) scale(${
                  distance === 0 ? 1 : 0.86
                }) rotate(${side * 8}deg)`,
                opacity: !isVisible ? 0 : distance === 0 ? 1 : 0.85,
                zIndex: distance === 0 ? 30 : 20,
                pointerEvents: isVisible ? "auto" : "none",
              }}
            >
              <div
                className="gmart-float flex h-[250px] flex-col overflow-hidden rounded-3xl border border-[#D6B875]/40 bg-[#F7F5EF] p-2.5 shadow-2xl dark:bg-[#162238] sm:h-[300px]"
                style={{
                  animation: "gmart-float 4s ease-in-out infinite",
                  animationDelay: `${(index % 3) * 0.6}s`,
                }}
              >
                {/* IMAGE */}

                <div className="relative flex h-[55%] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#EAE7DC] p-3 dark:bg-[#24324D]">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-6xl">🛍️</span>
                  )}

                  {discount > 0 && (
                    <span className="absolute right-2 top-2 rounded bg-red-500 px-2 py-1 text-[10px] font-bold text-white">
                      {discount}% OFF
                    </span>
                  )}
                </div>

                {/* PRODUCT INFORMATION */}

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-1 pt-3">
                  <p className="truncate text-[10px] font-bold uppercase leading-4 tracking-wider text-[#8A6D2F] dark:text-[#D6B875] sm:text-xs">
                    {product.category}
                  </p>

                  <h3 className={`mt-1 line-clamp-2 min-h-[40px] text-sm font-bold leading-5 sm:text-lg ${UI.text}`}>
                    {product.name}
                  </h3>

                  <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-2">
                    <span className={`text-base font-bold leading-5 sm:text-lg ${UI.text}`}>
                      {formatPrice(getDiscountedPrice(product))}
                    </span>

                    {discount > 0 && (
                      <span className={`text-[10px] leading-4 line-through sm:text-sm ${UI.faint}`}>
                        {formatPrice(Number(product.price))}
                      </span>
                    )}

                    <span className={`text-[10px] leading-4 sm:text-xs ${UI.muted}`}>
                      / {product.unit}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}

        {/* NAVIGATION */}

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => setActive((value) => value - 1)}
              aria-label="Previous featured product"
              className="absolute left-0 top-1/2 z-40 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#D6B875]/50 bg-[#101B2D]/90 text-2xl text-[#D6B875] transition hover:bg-[#D6B875] hover:text-[#101B2D]"
            >
              ‹
            </button>

            <button
              type="button"
              onClick={() => setActive((value) => value + 1)}
              aria-label="Next featured product"
              className="absolute right-0 top-1/2 z-40 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#D6B875]/50 bg-[#101B2D]/90 text-2xl text-[#D6B875] transition hover:bg-[#D6B875] hover:text-[#101B2D]"
            >
              ›
            </button>
          </>
        )}
      </div>

      {/* DOTS */}

      {count > 1 && (
        <div className="mt-3 flex justify-center gap-2">
          {entries.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`Show featured product ${index + 1}`}
              className={`h-2 rounded-full transition-all duration-300 ${
                current === index
                  ? "w-8 bg-[#D6B875]"
                  : "w-2 bg-white/50"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------
// HOME PAGE
// --------------------------------------------------

function Home() {
  const { theme, toggleTheme } = useTheme();

  const [products, setProducts] = useState<HomeProduct[]>([]);
  const [heroEntries, setHeroEntries] = useState<HeroEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [popularCategories, setPopularCategories] = useState<
    PopularCategoryRow[]
  >([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [specialOffers, setSpecialOffers] = useState<HomeProduct[]>([]);
  const [recentlyAdded, setRecentlyAdded] = useState<HomeProduct[]>([]);

  const [loading, setLoading] = useState(true);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [homepageError, setHomepageError] = useState("");

  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedBrandId, setSelectedBrandId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  // --------------------------------------------------
  // FETCH MAIN HOMEPAGE DATA
  // --------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    const fetchHomepage = async () => {
      setLoading(true);
      setHomepageError("");

      const results = await Promise.allSettled([
        api.get<HomeProduct[]>("/products/"),
        api.get<HeroEntry[]>("/homepage/hero"),
        api.get<Category[]>("/categories/home"),
        api.get<Category[]>("/categories/popular"),
        api.get<HomeProduct[]>("/homepage/special-offers"),
        api.get<HomeProduct[]>("/homepage/recently-added"),
      ]);

      if (cancelled) return;

      const [
        productResult,
        heroResult,
        categoryResult,
        popularResult,
        offerResult,
        recentResult,
      ] = results;

      if (productResult.status === "fulfilled") {
        setProducts(productResult.value.data);
      } else {
        console.error("Products loading error:", productResult.reason);
        setHomepageError("Unable to load all products.");
      }

      if (heroResult.status === "fulfilled") {
        setHeroEntries(heroResult.value.data);
      } else {
        console.error("Hero loading error:", heroResult.reason);
      }

      if (categoryResult.status === "fulfilled") {
        setCategories(categoryResult.value.data);
      } else {
        console.error("Categories loading error:", categoryResult.reason);
      }

      if (offerResult.status === "fulfilled") {
        setSpecialOffers(offerResult.value.data);
      } else {
        console.error("Offers loading error:", offerResult.reason);
      }

      if (recentResult.status === "fulfilled") {
        setRecentlyAdded(recentResult.value.data);
      } else {
        console.error("Recently added loading error:", recentResult.reason);
      }

      // Fetch products for each admin-selected popular category.
      if (popularResult.status === "fulfilled") {
        const popularRows = await Promise.all(
          popularResult.value.data.map(async (category) => {
            try {
              const response = await api.get<HomeProduct[]>(
                "/products/popular-category/",
                {
                  params: { category: category.name },
                }
              );

              return {
                category,
                products: response.data.filter(
                  (product) =>
                    product.is_available && product.stock > 0
                ),
              };
            } catch (error) {
              console.error(
                `Products loading error for ${category.name}:`,
                error
              );

              return {
                category,
                products: [],
              };
            }
          })
        );

        if (!cancelled) {
          setPopularCategories(popularRows);
        }
      } else {
        console.error(
          "Popular categories loading error:",
          popularResult.reason
        );
      }

      if (!cancelled) {
        setLoading(false);
      }
    };

    fetchHomepage();

    return () => {
      cancelled = true;
    };
  }, []);

  // --------------------------------------------------
  // FETCH HOME BRANDS
  // --------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    const fetchBrands = async () => {
      try {
        const response = await api.get<Brand[]>("/brands/home");

        if (!cancelled) {
          setBrands(response.data);
        }
      } catch (error) {
        console.error("Brand fetching error:", error);
      } finally {
        if (!cancelled) {
          setBrandsLoading(false);
        }
      }
    };

    fetchBrands();

    return () => {
      cancelled = true;
    };
  }, []);

  // --------------------------------------------------
  // FILTER ALL PRODUCTS
  // --------------------------------------------------

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === "All" ||
        product.category === selectedCategory;

      const matchesBrand =
        selectedBrandId === null ||
        product.brand_id === selectedBrandId;

      const matchesSearch = product.name
        .toLowerCase()
        .includes(search.trim().toLowerCase());

      return (
        matchesCategory &&
        matchesBrand &&
        matchesSearch &&
        product.is_available
      );
    });
  }, [products, selectedCategory, selectedBrandId, search]);

  // --------------------------------------------------
  // BRAND SELECTION
  // --------------------------------------------------

  const handleBrandClick = (brandId: number) => {
    setSelectedBrandId(brandId);
    setSelectedCategory("All");
    setSearch("");

    scrollToId("products");
  };

  // --------------------------------------------------
  // CATEGORY SELECTION
  // --------------------------------------------------

  const handleCategoryClick = (categoryName: string) => {
    setSelectedCategory(categoryName);
    setSelectedBrandId(null);

    scrollToId("products");
  };

  // --------------------------------------------------
  // SHOW ALL PRODUCTS
  // --------------------------------------------------

  const handleShowAllProducts = () => {
    setSelectedBrandId(null);
    setSelectedCategory("All");
    setSearch("");

    scrollToId("products");
  };

  // --------------------------------------------------
  // SEARCH FROM THE HEADER
  // --------------------------------------------------

  const handleHeaderSearch = (query: string) => {
    setSearch(query);
    setSelectedCategory("All");
    setSelectedBrandId(null);

    window.setTimeout(() => scrollToId("products"), 80);
  };

  // --------------------------------------------------
  // PAGE UI
  // --------------------------------------------------

  return (
    <div className={`min-h-screen ${UI.page} ${UI.text}`}>

      {/* <SiteHeader
        products={products}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSearch={handleHeaderSearch}
        logoSrc={LOGO_SRC}
        // cartCount={...}  // pass your cart item count here
        // notificationCount={...}  // pass unread notifications here
      /> */}

      {/* HERO */}

      <section
        id="home"
        className="scroll-mt-28 px-3 pb-2 pt-3 sm:px-8 sm:pt-4"
      >
        <div className="mx-auto max-w-7xl rounded-[28px] bg-[#101B2D] px-5 py-8 text-white dark:bg-[#1B2A44] sm:rounded-[32px] sm:px-12 sm:py-14">
          <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D6B875] sm:text-sm">
                Your neighbourhood store
              </p>

              <h1 className="mt-4 font-serif text-4xl font-bold leading-[1.1] sm:text-6xl">
                Everything You Need,
                <span className="block text-[#D6B875]">
                  Just Around the Corner.
                </span>
              </h1>

              <p className="mt-5 max-w-lg text-sm leading-7 text-gray-300 sm:text-base">
                Your everyday essentials, snacks, beverages and more.
                Order online and get everything conveniently.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#products"
                  className="inline-flex h-[52px] items-center justify-center rounded-full bg-[#D6B875] px-8 font-bold text-[#101B2D] transition hover:bg-white"
                >
                  Shop Now →
                </a>

                {specialOffers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => scrollToId("special-offers")}
                    className="inline-flex h-[52px] items-center justify-center rounded-full border border-[#D6B875] px-8 font-semibold text-white transition hover:bg-[#D6B875] hover:text-[#101B2D]"
                  >
                    Today's Deals
                  </button>
                )}
              </div>

              <p className="mt-5 text-sm text-gray-400">
                Open daily · 7:00 AM – 10:00 PM
              </p>
            </div>

            <HeroShowcase entries={heroEntries} />
          </div>
        </div>
      </section>

      {/* G-MART QUICK ACCESS */}

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className={`text-xs font-bold uppercase tracking-[0.2em] ${UI.gold}`}>
              Your shopping starts here
            </p>

            <h2 className={`mt-2 font-serif text-2xl font-bold sm:text-4xl ${UI.text}`}>
              Explore G-MART
            </h2>

            <p className={`mt-2 text-sm ${UI.muted}`}>
              Discover exciting deals and the latest arrivals.
            </p>
          </div>

          <span className="hidden text-3xl sm:block">🛍️</span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-5">

          {/* TODAY'S DEALS */}

          <button
            type="button"
            onClick={() => scrollToId("special-offers")}
            className="group relative flex min-h-40 flex-col justify-between overflow-hidden rounded-3xl bg-[#101B2D] p-4 text-left transition duration-300 hover:-translate-y-1 hover:shadow-xl dark:bg-[#1B2A44] sm:min-h-56 sm:p-7"
          >
            <div className="absolute -right-5 -top-5 h-24 w-24 rounded-full bg-[#D6B875]/20 transition group-hover:scale-125 sm:h-36 sm:w-36" />

            <div className="relative">
              <span className="text-3xl sm:text-5xl">🏷️</span>

              <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-[#D6B875] sm:text-xs">
                Save more today
              </p>

              <h3 className="mt-1 text-base font-bold text-white sm:text-2xl">
                Today's Deals
              </h3>

              <p className="mt-2 text-[10px] leading-relaxed text-gray-300 sm:text-sm">
                Exciting discounts on selected products.
              </p>
            </div>

            <span className="relative mt-4 text-xs font-bold text-[#D6B875] sm:text-sm">
              Explore offers →
            </span>
          </button>

          {/* FRESH ARRIVALS */}

          <button
            type="button"
            onClick={() => scrollToId("recently-added")}
            className="group relative flex min-h-40 flex-col justify-between overflow-hidden rounded-3xl bg-[#E9E6DA] p-4 text-left transition duration-300 hover:-translate-y-1 hover:shadow-xl dark:bg-[#162238] sm:min-h-56 sm:p-7"
          >
            <div className="absolute -right-5 -top-5 h-24 w-24 rounded-full bg-[#D6B875]/30 transition group-hover:scale-125 sm:h-36 sm:w-36" />

            <div className="relative">
              <span className="text-3xl sm:text-5xl">🛍️</span>

              <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-[#8A6D2F] dark:text-[#D6B875] sm:text-xs">
                Just arrived
              </p>

              <h3 className={`mt-1 text-base font-bold sm:text-2xl ${UI.text}`}>
                Fresh Arrivals
              </h3>

              <p className="mt-2 text-[10px] leading-relaxed text-gray-600 dark:text-[#9AA3B2] sm:text-sm">
                Check out the latest products at G-MART.
              </p>
            </div>

            <span className="relative mt-4 text-xs font-bold text-[#8A6D2F] dark:text-[#D6B875] sm:text-sm">
              Explore new →
            </span>
          </button>

        </div>
      </section>

      {/* SHOP BY CATEGORY */}

      {categories.length > 0 && (
        <section
          id="categories"
          className="mx-auto max-w-7xl scroll-mt-28 px-6 py-12"
        >
          <SectionHeading
            eyebrow="Explore"
            title="Shop by Category"
            description="Choose a category to find what you need."
          />

          <div className="flex gap-5 overflow-x-auto pb-5">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => handleCategoryClick(category.name)}
                className={`group w-40 min-w-40 flex-shrink-0 overflow-hidden rounded-2xl border text-left transition hover:-translate-y-1 hover:border-[#D6B875] hover:shadow-lg sm:w-48 sm:min-w-48 ${UI.surface} ${UI.border}`}
              >
                <div className={`flex h-28 items-center justify-center ${UI.tile}`}>
                  {category.image_url ? (
                    <img
                      src={category.image_url}
                      alt={category.name}
                      className="h-full w-full object-contain p-3"
                    />
                  ) : (
                    <span className="text-4xl">🛍️</span>
                  )}
                </div>

                <div className="p-4">
                  <p className={`font-bold transition group-hover:text-[#8A6D2F] dark:group-hover:text-[#D6B875] ${UI.text}`}>
                    {category.name}
                  </p>

                  <p className={`mt-1 text-xs ${UI.faint}`}>
                    Explore products →
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* SHOP BY BRAND */}

      <section
        id="brands"
        className={`scroll-mt-28 border-y py-14 ${UI.surface} ${UI.border}`}
      >
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeading
            eyebrow="Popular brands"
            title="Shop by Brand"
            description="Explore products from your favourite brands."
          />

          {brandsLoading ? (
            <p className={`py-8 text-center ${UI.muted}`}>
              Loading brands...
            </p>
          ) : brands.length === 0 ? (
            <p className={`rounded-2xl bg-[#F7F5EF] p-8 text-center dark:bg-[#0B1220] ${UI.muted}`}>
              No brands are currently featured.
            </p>
          ) : (
            <div className="flex gap-5 overflow-x-auto pb-4">
              {brands.map((brand) => (
                <button
                  key={brand.id}
                  type="button"
                  onClick={() => handleBrandClick(brand.id)}
                  className={`group flex min-w-36 flex-shrink-0 flex-col items-center rounded-2xl border p-5 transition hover:-translate-y-1 hover:border-[#D6B875] hover:shadow-lg ${UI.surface} ${UI.border}`}
                >
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-[#F7F5EF] dark:bg-[#24324D]">
                    {brand.logo_url ? (
                      <img
                        src={brand.logo_url}
                        alt={brand.name}
                        className="h-full w-full object-contain p-2"
                      />
                    ) : (
                      <span className="text-4xl">🏷️</span>
                    )}
                  </div>

                  <span className={`mt-3 text-center text-sm font-bold transition group-hover:text-[#8A6D2F] dark:group-hover:text-[#D6B875] ${UI.text}`}>
                    {brand.name}
                  </span>

                  <span className={`mt-1 text-xs ${UI.faint}`}>
                    Explore products →
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* POPULAR CATEGORIES */}

      {popularCategories.map(({ category, products: categoryProducts }) => (
        <section
          key={category.id}
          className="mx-auto max-w-7xl px-6 py-12"
        >
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-[0.18em] sm:text-sm ${UI.gold}`}>
                Popular collection
              </p>

              <h2 className="mt-2 font-serif text-2xl font-bold sm:text-3xl">
                {category.name}
              </h2>

              {category.description && (
                <p className={`mt-1 text-sm ${UI.muted}`}>
                  {category.description}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleCategoryClick(category.name)}
              className={`text-sm font-semibold hover:underline ${UI.gold}`}
            >
              View all →
            </button>
          </div>

          <ProductRow products={categoryProducts} />
        </section>
      ))}

      {/* SPECIAL OFFERS - HORIZONTAL SCROLL */}

      {specialOffers.length > 0 && (
        <section
          id="special-offers"
          className={`scroll-mt-28 border-y py-14 ${UI.surface} ${UI.border}`}
        >
          <div className="mx-auto max-w-7xl px-6">
            <SectionHeading
              eyebrow="Limited-time savings"
              title="Special Offers"
              description="Enjoy discounts on selected products."
            />

            <ProductRow products={specialOffers} />
          </div>
        </section>
      )}

      {/* RECENTLY ADDED - HORIZONTAL SCROLL */}

      {recentlyAdded.length > 0 && (
        <section
          id="recently-added"
          className="mx-auto max-w-7xl scroll-mt-28 px-6 py-14"
        >
          <SectionHeading
            eyebrow="Fresh arrivals"
            title="Recently Added"
            description="Discover the latest products added to G-MART."
          />

          <ProductRow products={recentlyAdded} />
        </section>
      )}

      {/* ALL PRODUCTS - NORMAL GRID */}

      <section
        id="products"
        className={`scroll-mt-28 py-16 ${UI.page}`}
      >
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-[0.18em] sm:text-sm ${UI.gold}`}>
                Our collection
              </p>

              <h2 className="mt-2 font-serif text-3xl font-bold sm:text-4xl">
                {selectedBrandId !== null
                  ? `Products from ${
                      brands.find((brand) => brand.id === selectedBrandId)
                        ?.name || "Selected Brand"
                    }`
                  : selectedCategory !== "All"
                    ? selectedCategory
                    : "All Products"}
              </h2>

              <p className={`mt-2 ${UI.muted}`}>
                Find your everyday essentials at G-MART.
              </p>
            </div>

            {(selectedBrandId !== null || selectedCategory !== "All") && (
              <button
                type="button"
                onClick={handleShowAllProducts}
                className="rounded-full border border-[#101B2D] px-5 py-2 text-sm font-semibold transition hover:bg-[#101B2D] hover:text-white dark:border-[#D6B875] dark:text-[#D6B875] dark:hover:bg-[#D6B875] dark:hover:text-[#101B2D]"
              >
                Show all products
              </button>
            )}
          </div>

          {/* CATEGORY FILTER */}

          <div className="mb-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedCategory("All");
                setSelectedBrandId(null);
              }}
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                selectedCategory === "All" && selectedBrandId === null
                  ? UI.active
                  : `${UI.field} ${UI.text}`
              }`}
            >
              All
            </button>

            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(category.name);
                  setSelectedBrandId(null);
                }}
                className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                  selectedCategory === category.name
                    ? UI.active
                    : `${UI.field} ${UI.text}`
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>

          {/* SEARCH */}

          <div className="mb-8">
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={`w-full max-w-md rounded-full border px-5 py-3 outline-none transition focus:border-[#D6B875] ${UI.field} ${UI.text}`}
            />
          </div>

          {/* LOADING */}

          {loading && (
            <div className="py-16 text-center">
              <div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-4 border-gray-200 border-t-[#D6B875] dark:border-white/10 dark:border-t-[#D6B875]" />
              <p className="font-semibold">Loading products...</p>
            </div>
          )}

          {/* ERROR */}

          {!loading && homepageError && (
            <div className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-300">
              {homepageError}
            </div>
          )}

          {/* PRODUCT GRID */}

          {!loading && (
            <>
              {filteredProducts.length === 0 ? (
                <div className={`py-16 text-center ${UI.muted}`}>
                  {selectedBrandId !== null
                    ? "No available products are linked to this brand yet."
                    : "No products found."}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {filteredProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* FOOTER */}

      <footer className="bg-[#101B2D] px-6 py-10 text-white dark:bg-[#070C16]">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 md:flex-row">
          <div>
            <h2 className="font-serif text-2xl font-bold">
              G-<span className="text-[#D6B875]">MART</span>
            </h2>

            <p className="mt-2 text-sm text-gray-400">
              Your everyday shopping destination.
            </p>
          </div>

          <div>
            <p className="font-semibold text-[#D6B875]">
              Store Hours
            </p>

            <p className="mt-2 text-sm text-gray-300">
              Every day: 7:00 AM – 10:00 PM
            </p>
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-7xl border-t border-gray-700 pt-5 text-center text-sm text-gray-400">
          © 2026 G-MART. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

export default Home;
