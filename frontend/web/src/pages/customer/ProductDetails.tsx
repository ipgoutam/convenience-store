import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../../services/api";
import { useCart } from "../../context/CartContext";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../hooks/useTheme";
import type { Product } from "../../types/product";

type PurchaseMode = "quantity" | "amount";
type Tab = "description" | "specifications" | "reviews";

interface ProductImage {
  id: number;
  product_id: number;
  image_url: string;
  display_order: number;
}

interface Review {
  id: number;
  user_id: number;
  product_id: number;
  rating: number;
  review_text: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  user_name?: string;
}

const MEASUREMENT_UNITS = ["kg", "g", "litre", "ml"];
const WISHLIST_KEY = "gmart_wishlist";
const RECENT_KEY = "gmart_recently_viewed";

const formatPrice = (value: string | number | null | undefined) => {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(number) ? number : 0);
};

const getDiscountedPrice = (product: Product) => {
  const discounted = Number(product.discounted_price);
  if (Number.isFinite(discounted) && discounted > 0) {
    return discounted;
  }
  const price = Number(product.price);
  const discount = Number(product.discount_percentage);
  if (discount > 0) {
    return price * (1 - discount / 100);
  }
  return price;
};

const getLocalIds = (key: string): number[] => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(value)) return [];
    return value.map(Number).filter((id) => Number.isInteger(id) && id > 0);
  } catch {
    return [];
  }
};

const saveLocalIds = (key: string, ids: number[]) => {
  localStorage.setItem(key, JSON.stringify([...new Set(ids)]));
};

const getArray = <T,>(data: unknown): T[] => {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const object = data as Record<string, unknown>;
    if (Array.isArray(object.items)) return object.items as T[];
    if (Array.isArray(object.products)) return object.products as T[];
    if (Array.isArray(object.reviews)) return object.reviews as T[];
    if (Array.isArray(object.images)) return object.images as T[];
    if (Array.isArray(object.product_ids)) return object.product_ids as T[];
  }
  return [];
};

const getImageUrl = (product: Product) => product.image_url || "";

const ProductDetails = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { user } = useAuth();

  // ✅ THEME - same hook as Home.tsx
  const themeCtx = useTheme() as any;
  const isDark = Boolean(
    themeCtx?.isDark ||
      themeCtx?.darkMode ||
      themeCtx?.dark ||
      themeCtx?.theme === "dark" ||
      themeCtx?.mode === "dark"
  );

  // ✅ Theme tokens - only colours, no logic change
  const t = {
    page: isDark ? "bg-[#0E1A2B] text-white" : "bg-[#F7F5EF] text-[#101B2D]",
    card: isDark ? "bg-[#1A2A42] border-[#2E3F5A]" : "bg-white border-[#e8e2d5]",
    cardSoft: isDark ? "bg-[#1A2A42]" : "bg-[#F7F5EF]",
    heading: isDark ? "text-white" : "text-[#101B2D]",
    sub: isDark ? "text-gray-400" : "text-gray-500",
    body: isDark ? "text-gray-300" : "text-gray-600",
    border: isDark ? "border-[#2E3F5A]" : "border-[#e5dece]",
    input: isDark ? "bg-[#0E1A2B] border-[#2E3F5A] text-white" : "bg-white border-[#d9d2c4] text-[#101B2D]",
    inputInner: isDark ? "bg-[#0E1A2B] border-[#2E3F5A] text-white" : "bg-white border-[#e5dece] text-[#101B2D]",
    btnPrimary: isDark ? "bg-[#D6B875] text-[#101B2D] hover:bg-[#C9A24B]" : "bg-[#101B2D] text-white hover:bg-[#263b59]",
    btnOutline: isDark ? "border-[#D6B875] text-[#D6B875] hover:bg-[#D6B875] hover:text-[#101B2D]" : "border-[#101B2D] text-[#101B2D] hover:bg-[#101B2D] hover:text-white",
    divider: isDark ? "divide-[#2E3F5A]" : "divide-[#eee9df]",
    reviewBox: isDark ? "bg-[#1A2A42]" : "bg-[#F7F5EF]",
  };

  const addButtonRef = useRef<HTMLButtonElement>(null);

  const [product, setProduct] = useState<Product | null>(null);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [activeImage, setActiveImage] = useState("");
  const [zoomOpen, setZoomOpen] = useState(false);

  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [recentProducts, setRecentProducts] = useState<Product[]>([]);
  const [frequentlyBought, setFrequentlyBought] = useState<Product[]>([]);
  const [selectedTogether, setSelectedTogether] = useState<number[]>([]);

  const [reviews, setReviews] = useState<Review[]>([]);
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const [wishlist, setWishlist] = useState<number[]>([]);
  const [isWishlisted, setIsWishlisted] = useState(false);

  const [notifySubscribed, setNotifySubscribed] = useState(false);
  const [notifyLoading, setNotifyLoading] = useState(false);

  const [purchaseMode, setPurchaseMode] = useState<PurchaseMode>("quantity");
  const [quantity, setQuantity] = useState(1);
  const [amount, setAmount] = useState(1);

  const [activeTab, setActiveTab] = useState<Tab>("description");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [adding, setAdding] = useState(false);

  const isCustomer = user?.role === "customer";
  const id = Number(productId);

  const isMeasurementUnit = product ? MEASUREMENT_UNITS.includes(product.unit?.toLowerCase()) : false;
  const canPurchaseByAmount = Boolean(product?.allow_purchase_by_amount) && isMeasurementUnit;
  const discountedPrice = product ? getDiscountedPrice(product) : 0;
  const originalPrice = Number(product?.mrp || product?.price || 0);
  const discountPercentage = Number(product?.discount_percentage || 0);
  const savings = Math.max(0, originalPrice - discountedPrice);
  const isOutOfStock = !product || !product.is_available || Number(product.stock) <= 0;
  const stockThreshold = Number((product as (Product & { low_stock_threshold?: number }) | null)?.low_stock_threshold ?? 0);
  const isLowStock = !isOutOfStock && stockThreshold > 0 && Number(product?.stock) <= stockThreshold;
  const selectedValue = purchaseMode === "quantity" ? quantity : amount;
  const selectedProductPrice = purchaseMode === "amount" ? discountedPrice * amount : discountedPrice * quantity;

  const averageRating = useMemo(() => {
    if (!reviews.length) return 0;
    return reviews.reduce((total, review) => total + review.rating, 0) / reviews.length;
  }, [reviews]);

  const dispatchCartAnimation = useCallback((item: Product, button?: HTMLButtonElement | null) => {
    const rect = button?.getBoundingClientRect();
    window.dispatchEvent(
      new CustomEvent("gmart:add-to-cart", {
        detail: {
          productName: item.name,
          message: `${item.name} added to cart`,
          startX: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
          startY: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
        },
      })
    );
  }, []);

  const loadProduct = useCallback(async () => {
    if (!Number.isInteger(id) || id <= 0) {
      setError("This product could not be found.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await api.get(`/products/${id}`);
      const currentProduct = response.data as Product;
      setProduct(currentProduct);
      const [imageResult, allProductsResult] = await Promise.allSettled([
        api.get(`/product-details/${id}/images`),
        api.get("/products/"),
      ]);
      let productImages: ProductImage[] = [];
      if (imageResult.status === "fulfilled") {
        productImages = getArray<ProductImage>(imageResult.value.data);
      }
      if (productImages.length > 0) {
        productImages.sort((a, b) => a.display_order - b.display_order);
        setImages(productImages);
        setActiveImage(productImages[0].image_url);
      } else {
        const fallbackImage = getImageUrl(currentProduct);
        setImages(fallbackImage ? [{ id: 0, product_id: currentProduct.id, image_url: fallbackImage, display_order: 0 }] : []);
        setActiveImage(fallbackImage);
      }
      if (allProductsResult.status === "fulfilled") {
        const allProducts = getArray<Product>(allProductsResult.value.data);
        const related = allProducts.filter((item) => item.id !== currentProduct.id && item.category === currentProduct.category).slice(0, 8);
        setRelatedProducts(related);
      }
    } catch {
      setError("We couldn't load this product right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  // Recently viewed: guest browser storage and logged-in account storage.
  useEffect(() => {
    if (!product || !id) return;
    const guestIds = getLocalIds(RECENT_KEY).filter((recentId) => recentId !== id);
    const updatedIds = [id, ...guestIds].slice(0, 8);
    saveLocalIds(RECENT_KEY, updatedIds);
    const loadRecentProducts = async () => {
      try {
        if (user) {
          await api.post(`/product-details/recently-viewed/${id}`);
          const response = await api.get("/product-details/recently-viewed");
          const data = getArray<Product>(response.data);
          setRecentProducts(data.filter((item) => item.id !== id).slice(0, 8));
          await api.post("/product-details/recently-viewed/sync", { product_ids: updatedIds });
        } else {
          const response = await api.get("/products/");
          const allProducts = getArray<Product>(response.data);
          setRecentProducts(
            updatedIds.filter((recentId) => recentId !== id).map((recentId) => allProducts.find((item) => item.id === recentId)).filter((item): item is Product => Boolean(item)).slice(0, 8)
          );
        }
      } catch {
        // Recently viewed is optional; the product page should still work.
      }
    };
    void loadRecentProducts();
  }, [product?.id, id, user]);

  // Wishlist: sync guest selections when the customer signs in.
  useEffect(() => {
    const loadWishlist = async () => {
      const guestIds = getLocalIds(WISHLIST_KEY);
      if (!user) {
        setWishlist(guestIds);
        setIsWishlisted(guestIds.includes(id));
        return;
      }
      try {
        if (guestIds.length) {
          await api.post("/product-details/wishlist/sync", { product_ids: guestIds });
          saveLocalIds(WISHLIST_KEY, []);
        }
        const response = await api.get("/product-details/wishlist");
        const data = getArray<unknown>(response.data);
        const ids = data.map((item) => {
          if (typeof item === "number") return item;
          if (typeof item === "string") return Number(item);
          if (item && typeof item === "object") {
            const object = item as Record<string, unknown>;
            return Number(object.product_id ?? object.id);
          }
          return 0;
        }).filter((value) => Number.isInteger(value) && value > 0);
        setWishlist(ids);
        setIsWishlisted(ids.includes(id));
      } catch {
        setWishlist(guestIds);
        setIsWishlisted(guestIds.includes(id));
      }
    };
    if (id > 0) void loadWishlist();
  }, [user, id]);

  // Frequently Bought Together.
  useEffect(() => {
    if (!product) return;
    const loadFrequentlyBought = async () => {
      try {
        const response = await api.get(`/product-details/${id}/frequently-bought-together`);
        const data = response.data;
        let productIds: number[] = [];
        if (Array.isArray(data)) {
          productIds = data.map((item) => typeof item === "number" ? item : Number((item as Record<string, unknown>).product_id ?? (item as Record<string, unknown>).id)).filter((value) => Number.isInteger(value) && value > 0);
        } else if (data && typeof data === "object") {
          const object = data as Record<string, unknown>;
          const values = getArray<unknown>(data);
          productIds = (values.length ? values : Array.isArray(object.product_ids) ? object.product_ids : []).map((item) => typeof item === "number" ? item : Number((item as Record<string, unknown>).product_id ?? (item as Record<string, unknown>).id)).filter((value) => Number.isInteger(value) && value > 0);
        }
        let products: Product[] = [];
        if (productIds.length) {
          const results = await Promise.allSettled(productIds.map((productId) => api.get(`/products/${productId}`)));
          products = results.filter((result) => result.status === "fulfilled").map((result) => result.value.data);
        }
        if (!products.length) {
          const responseAll = await api.get("/products/");
          products = getArray<Product>(responseAll.data).filter((item) => item.id !== id && item.category === product.category);
        }
        const finalProducts = products.filter((item) => item.id !== id && item.is_available && Number(item.stock) > 0).slice(0, 4);
        setFrequentlyBought(finalProducts);
        setSelectedTogether(finalProducts.map((item) => item.id));
      } catch {
        setFrequentlyBought([]);
      }
    };
    void loadFrequentlyBought();
  }, [product?.id, id]);

  // Customer reviews and the current customer's review.
  const loadReviews = useCallback(async () => {
    if (!id) return;
    try {
      const response = await api.get(`/product-details/${id}/reviews`);
      setReviews(getArray<Review>(response.data));
    } catch {
      setReviews([]);
    }
    if (user) {
      try {
        const response = await api.get(`/product-details/${id}/reviews/my`);
        const review = response.data as Review | null;
        setMyReview(review);
        if (review) {
          setReviewRating(review.rating);
          setReviewText(review.review_text || "");
        }
      } catch {
        setMyReview(null);
      }
    } else {
      setMyReview(null);
    }
  }, [id, user]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  // Notify Me subscription status.
  useEffect(() => {
    if (!product || !user || !isOutOfStock) {
      setNotifySubscribed(false);
      return;
    }
    const loadNotifyStatus = async () => {
      try {
        const response = await api.get(`/product-details/notify-me/${id}/status`);
        setNotifySubscribed(Boolean(response.data?.subscribed ?? response.data?.is_subscribed ?? response.data?.active));
      } catch {
        setNotifySubscribed(false);
      }
    };
    void loadNotifyStatus();
  }, [product?.id, user, isOutOfStock, id]);

  const handleAddToCart = async (item: Product = product!, mode: PurchaseMode = purchaseMode, value: number = selectedValue, button?: HTMLButtonElement | null) => {
    if (!item || adding) return false;
    if (!item.is_available || Number(item.stock) <= 0) {
      setActionMessage("This product is currently out of stock.");
      return false;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setActionMessage("Please select a valid quantity.");
      return false;
    }
    if (mode === "quantity" && !Number.isInteger(value)) {
      setActionMessage("Please enter a whole-number quantity.");
      return false;
    }
    if (mode === "quantity" && value > Number(item.stock)) {
      setActionMessage("The selected quantity exceeds available stock.");
      return false;
    }
    setAdding(true);
    setActionMessage("");
    try {
      const success = await addToCart(item, mode, value);
      if (!success) {
        setActionMessage("Unable to add this product to your cart.");
        return false;
      }
      dispatchCartAnimation(item, button);
      setActionMessage(`${item.name} added to your cart.`);
      return true;
    } catch {
      setActionMessage("Something went wrong. Please try again.");
      return false;
    } finally {
      setAdding(false);
    }
  };

  const handleBuyNow = async () => {
    const success = await handleAddToCart(product!, purchaseMode, selectedValue, addButtonRef.current);
    if (success) navigate("/checkout");
  };

  const toggleWishlist = async () => {
    if (!product) return;
    const nextState = !isWishlisted;
    setIsWishlisted(nextState);
    const currentIds = getLocalIds(WISHLIST_KEY);
    const nextIds = nextState ? [...currentIds, id] : currentIds.filter((itemId) => itemId !== id);
    saveLocalIds(WISHLIST_KEY, nextIds);
    setWishlist((previous) => nextState ? [...new Set([...previous, id])] : previous.filter((itemId) => itemId !== id));
    try {
      if (user) {
        if (nextState) await api.post(`/product-details/wishlist/${id}`);
        else await api.delete(`/product-details/wishlist/${id}`);
      }
      setActionMessage(nextState ? "Added to your wishlist." : "Removed from your wishlist.");
    } catch {
      setIsWishlisted(!nextState);
      setActionMessage("Unable to update your wishlist. Please try again.");
    }
  };

  const handleNotifyMe = async () => {
    if (!user) {
      navigate("/login");
      return;
    }
    setNotifyLoading(true);
    try {
      if (notifySubscribed) {
        await api.delete(`/product-details/notify-me/${id}`);
        setNotifySubscribed(false);
        setActionMessage("Stock notification cancelled.");
      } else {
        await api.post(`/product-details/notify-me/${id}`);
        setNotifySubscribed(true);
        setActionMessage("We'll notify you when this product is back in stock.");
      }
    } catch {
      setActionMessage("Unable to update your notification.");
    } finally {
      setNotifyLoading(false);
    }
  };

  const handleReviewSubmit = async () => {
    if (!user) {
      navigate("/login");
      return;
    }
    setReviewSubmitting(true);
    setReviewMessage("");
    try {
      await api.post(`/product-details/${id}/reviews`, { rating: reviewRating, review_text: reviewText.trim() || null });
      setReviewMessage("Your review has been submitted and is awaiting admin approval.");
      await loadReviews();
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "You may review this product after completing a purchase.";
      setReviewMessage(message);
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleShare = async () => {
    if (!product) return;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: product.name, text: `Check out ${product.name} on G-MART.`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setActionMessage("Product link copied.");
      }
    } catch {
      // The customer may close the native share menu.
    }
  };

  const handleAddSelectedTogether = async () => {
    const selectedProducts = frequentlyBought.filter((item) => selectedTogether.includes(item.id));
    if (!selectedProducts.length) return;
    for (const item of selectedProducts) {
      const success = await handleAddToCart(item, "quantity", 1, null);
      if (!success) return;
    }
    setActionMessage("Selected products added to your cart.");
  };

  const toggleTogetherProduct = (productId: number) => {
    setSelectedTogether((previous) => previous.includes(productId) ? previous.filter((itemId) => itemId !== productId) : [...previous, productId]);
  };

  const scrollCarousel = (elementId: string, direction: "left" | "right") => {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.scrollBy({ left: direction === "left" ? -320 : 320, behavior: "smooth" });
  };

  // ✅ FIXED CARD - inline style locks width, no broken Tailwind class
  const renderProductCard = (item: Product) => {
    const itemPrice = getDiscountedPrice(item);
    const itemMrp = Number(item.mrp || item.price || 0);
    const itemDiscount = Number(item.discount_percentage || 0);
    const itemOutOfStock = !item.is_available || Number(item.stock) <= 0;
    return (
      <div
        key={item.id}
        style={{ width: "190px", minWidth: "190px", maxWidth: "190px", flex: "0 0 190px", display: "flex", flexDirection: "column" }}
        className={`overflow-hidden rounded-2xl border shadow-sm ${t.card}`}
      >
        <Link to={`/products/${item.id}`} style={{ display: "block", height: "160px", flexShrink: 0 }} className={`block ${t.cardSoft}`}>
          <div style={{ height: "100%", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            {getImageUrl(item) ? (
              <img src={getImageUrl(item)} alt={item.name} style={{ height: "100%", width: "100%", objectFit: "contain" }} className="transition duration-300 hover:scale-105" />
            ) : (
              <span className="text-4xl text-[#b8b1a2]">▧</span>
            )}
          </div>
        </Link>
        <div className="p-3" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <p className={`mb-1 truncate text-xs ${t.sub}`}>{item.brand || item.category}</p>
          <Link to={`/products/${item.id}`} className={`line-clamp-2 min-h-10 text-sm font-semibold hover:text-[#9b7936] ${t.heading}`}>{item.name}</Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`font-bold ${t.heading}`}>{formatPrice(itemPrice)}</span>
            {itemMrp > itemPrice && <span className="text-xs text-gray-400 line-through">{formatPrice(itemMrp)}</span>}
          </div>
          {itemDiscount > 0 && <p className="mt-1 text-xs font-medium text-green-700">{itemDiscount}% off</p>}
          <button type="button" disabled={itemOutOfStock} onClick={() => { void handleAddToCart(item, "quantity", 1, null); }} className={`mt-3 w-full rounded-xl px-3 py-2 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-gray-300 ${t.btnPrimary}`}>
            {itemOutOfStock ? "Out of Stock" : "Quick Add"}
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className={`min-h- px-4 py-8 ${t.page}`}>
        <div className="mx-auto max-w-6xl animate-pulse">
          <div className="mb-6 h-4 w-48 rounded bg-gray-200" />
          <div className="grid gap-8 lg:grid-cols-[45%_55%]">
            <div>
              <div className="h- rounded-3xl bg-gray-200 sm:h-" />
              <div className="mt-4 flex gap-3">
                {[1, 2, 3, 4].map((item) => (<div key={item} className="h-20 w-20 rounded-xl bg-gray-200" />))}
              </div>
            </div>
            <div className="space-y-5">
              <div className="h-4 w-28 rounded bg-gray-200" />
              <div className="h-9 w-3/4 rounded bg-gray-200" />
              <div className="h-6 w-40 rounded bg-gray-200" />
              <div className="h-12 w-48 rounded bg-gray-200" />
              <div className="h-24 rounded bg-gray-200" />
              <div className="h-12 rounded-xl bg-gray-200" />
              <div className="h-12 rounded-xl bg-gray-200" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className={`flex min-h- items-center justify-center px-4 py-12 ${t.page}`}>
        <div className="max-w-md text-center">
          <div className="mb-4 text-5xl">:(</div>
          <h2 className={`text-2xl font-bold ${t.heading}`}>Product unavailable</h2>
          <p className={`mt-3 text-sm leading-6 ${t.body}`}>{error || "We couldn't find this product."}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => void loadProduct()} className={`rounded-xl px-5 py-3 text-sm font-semibold ${t.btnPrimary}`}>Try Again</button>
            <Link to="/" className={`rounded-xl border px-5 py-3 text-sm font-semibold ${t.btnOutline}`}>Back to Shop</Link>
          </div>
        </div>
      </div>
    );
  }

  const specifications = [
    ["Brand", product.brand],
    ["Category", product.category],
    ["Unit", product.unit],
    ["SKU", (product as Product & { sku?: string }).sku],
    ["Barcode", (product as Product & { barcode?: string }).barcode],
  ].filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "");

  const totalTogetherPrice = frequentlyBought.filter((item) => selectedTogether.includes(item.id)).reduce((total, item) => total + getDiscountedPrice(item), 0);

  return (
    <div className={`min-h-screen overflow-x-hidden pb-28 lg:pb-12 ${t.page}`}>
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        {/* Breadcrumbs */}
        <nav className={`mb-6 flex items-center gap-2 overflow-x-auto whitespace-nowrap text-xs sm:text-sm ${t.sub}`}>
          <Link to="/" className="hover:text-[#9b7936]">Home</Link>
          <span>/</span>
          <span>{product.category}</span>
          {product.brand && (<><span>/</span><span>{product.brand}</span></>)}
          <span>/</span>
          <span className={`font-semibold ${t.heading}`}>{product.name}</span>
        </nav>

        {/* Main product section */}
        <section className="grid gap-7 lg:grid-cols-[45%_55%] lg:gap-10">
          {/* Product gallery */}
          <div className="min-w-0">
            <div className={`relative flex aspect-square max-h- items-center justify-center overflow-hidden rounded-3xl border p-5 sm:p-8 ${t.card} ${t.cardSoft}`}>
              {activeImage ? (
                <button type="button" onClick={() => setZoomOpen(true)} className="flex h-full w-full items-center justify-center" aria-label="Zoom product image">
                  <img src={activeImage} alt={product.name} className="max-h-full max-w-full object-contain transition duration-300 hover:scale-[1.03]" />
                </button>
              ) : (<span className="text-6xl text-gray-300">▧</span>)}
              {discountPercentage > 0 && <span className="absolute left-4 top-4 rounded-full bg-[#101B2D] px-3 py-1.5 text-xs font-bold text-[#D6B875]">{discountPercentage}% OFF</span>}
              <button type="button" onClick={() => void toggleWishlist()} className={`absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-2xl shadow-sm transition hover:scale-110 ${isDark ? "bg-[#0E1A2B]" : "bg-white"}`} aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}>
                <span className={isWishlisted ? "text-red-500" : "text-gray-500"}>{isWishlisted ? "♥" : "♡"}</span>
              </button>
              <button type="button" onClick={() => void handleShare()} className={`absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full text-lg shadow-sm ${isDark ? "bg-[#0E1A2B] text-white" : "bg-white text-[#101B2D] hover:bg-gray-50"}`} aria-label="Share product">↗</button>
            </div>
            {images.length > 1 && (
              <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
                {images.map((image) => (
                  <button key={image.id} type="button" onClick={() => setActiveImage(image.image_url)} className={`h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border-2 p-2 ${t.cardSoft} ${activeImage === image.image_url ? "border-[#D6B875]" : "border-transparent"}`}>
                    <img src={image.image_url} alt={`${product.name} view`} className="h-full w-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product information and purchase controls */}
          <div className="min-w-0">
            {product.brand && <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-[#9b7936]">{product.brand}</p>}
            <div className="flex items-start justify-between gap-3">
              <h1 className={`text-2xl font-bold leading-tight sm:text-3xl ${t.heading}`}>{product.name}</h1>
              <button type="button" onClick={() => void toggleWishlist()} className="flex-shrink-0 text-2xl" aria-label="Toggle wishlist">
                <span className={isWishlisted ? "text-red-500" : "text-gray-400"}>{isWishlisted ? "♥" : "♡"}</span>
              </button>
            </div>
            <p className={`mt-2 text-sm ${t.sub}`}>{product.category}</p>
            <button type="button" onClick={() => setActiveTab("reviews")} className="mt-3 flex items-center gap-2 text-sm">
              <span className="text-[#c08e28]">{reviews.length ? `★ ${averageRating.toFixed(1)}` : "☆☆☆☆☆"}</span>
              <span className={`${t.sub} underline`}>{reviews.length ? `${reviews.length} reviews` : "Be the first to review"}</span>
            </button>
            <div className={`mt-6 border-y py-5 ${t.border}`}>
              <div className="flex flex-wrap items-baseline gap-3">
                <span className={`text-3xl font-bold ${t.heading}`}>{formatPrice(discountedPrice)}</span>
                {originalPrice > discountedPrice && <span className="text-base text-gray-400 line-through">{formatPrice(originalPrice)}</span>}
                {discountPercentage > 0 && <span className="rounded-md bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">{discountPercentage}% off</span>}
              </div>
              {savings > 0 && <p className="mt-2 text-sm font-medium text-green-700">You save {formatPrice(savings)}</p>}
              <div className="mt-4">
                {isOutOfStock ? (<span className="inline-flex rounded-full bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-600">Out of Stock</span>) : isLowStock ? (<span className="text-sm font-semibold text-orange-600">Only {product.stock} left</span>) : (<span className="text-sm font-semibold text-green-700">In Stock</span>)}
              </div>
            </div>

            {/* Purchase selector */}
            {!isOutOfStock && (
              <div className="mt-5">
                {canPurchaseByAmount && (
                  <div className="mb-4 flex gap-2">
                    <button type="button" onClick={() => setPurchaseMode("quantity")} className={`rounded-lg border px-4 py-2 text-sm font-semibold ${purchaseMode === "quantity" ? (isDark ? "border-[#D6B875] bg-[#D6B875] text-[#101B2D]" : "border-[#101B2D] bg-[#101B2D] text-white") : (isDark ? "border-[#2E3F5A] text-white" : "border-gray-300 text-[#101B2D]")}`}>Quantity</button>
                    <button type="button" onClick={() => setPurchaseMode("amount")} className={`rounded-lg border px-4 py-2 text-sm font-semibold ${purchaseMode === "amount" ? (isDark ? "border-[#D6B875] bg-[#D6B875] text-[#101B2D]" : "border-[#101B2D] bg-[#101B2D] text-white") : (isDark ? "border-[#2E3F5A] text-white" : "border-gray-300 text-[#101B2D]")}`}>By Amount</button>
                  </div>
                )}
                <label className={`mb-2 block text-sm font-semibold ${t.heading}`}>{purchaseMode === "amount" ? `Amount (${product.unit})` : "Quantity"}</label>
                <div className={`flex max-w-xs items-center overflow-hidden rounded-xl border ${t.input}`}>
                  <button type="button" onClick={() => { if (purchaseMode === "quantity") setQuantity((v) => Math.max(1, v - 1)); else setAmount((v) => Math.max(0.1, Number((v - 0.1).toFixed(2)))); }} className={`h-12 w-12 text-xl ${t.heading}`}>−</button>
                  <input type="number" min={purchaseMode === "quantity" ? 1 : 0.1} step={purchaseMode === "quantity" ? 1 : 0.1} max={purchaseMode === "quantity" ? product.stock : undefined} value={purchaseMode === "quantity" ? quantity : amount} onChange={(e) => { const v = Number(e.target.value); if (purchaseMode === "quantity") setQuantity(Math.max(1, Math.min(product.stock, Math.floor(v || 1)))); else setAmount(Math.max(0.1, v || 0.1)); }} className={`h-12 min-w-0 flex-1 border-x text-center font-semibold outline-none ${t.inputInner}`} />
                  <button type="button" onClick={() => { if (purchaseMode === "quantity") setQuantity((v) => Math.min(Number(product.stock), v + 1)); else setAmount((v) => Number((v + 0.1).toFixed(2))); }} className={`h-12 w-12 text-xl ${t.heading}`}>+</button>
                </div>
                <p className={`mt-3 text-sm ${t.sub}`}>Selected total: <span className={`font-bold ${t.heading}`}>{formatPrice(selectedProductPrice)}</span></p>
              </div>
            )}

            {/* Main purchase buttons */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              {isOutOfStock ? (
                <button type="button" onClick={() => void handleNotifyMe()} disabled={notifyLoading} className={`col-span-2 rounded-xl px-4 py-3.5 text-sm font-bold transition disabled:opacity-60 ${t.btnPrimary}`}>{notifyLoading ? "Please wait..." : notifySubscribed ? "Cancel Stock Notification" : "Notify Me"}</button>
              ) : (
                <>
                  <button ref={addButtonRef} type="button" disabled={adding} onClick={() => { void handleAddToCart(product, purchaseMode, selectedValue, addButtonRef.current); }} className={`rounded-xl border-2 px-3 py-3.5 text-sm font-bold transition disabled:opacity-60 ${t.btnOutline}`}>{adding ? "Adding..." : "Add to Cart"}</button>
                  <button type="button" disabled={adding} onClick={() => void handleBuyNow()} className={`rounded-xl px-3 py-3.5 text-sm font-bold transition disabled:opacity-60 ${t.btnPrimary}`}>Buy Now</button>
                </>
              )}
            </div>
            {actionMessage && <p className="mt-3 text-sm font-medium text-[#80652e]" role="status">{actionMessage}</p>}

            {/* Fulfillment information */}
            <div className={`mt-6 grid gap-3 rounded-2xl border p-4 sm:grid-cols-2 ${t.card}`}>
              <div className="flex gap-3"><span className="text-xl">⌂</span><div><p className={`text-sm font-semibold ${t.heading}`}>Home Delivery</p><p className={`text-xs ${t.sub}`}>Delivery availability shown at checkout</p></div></div>
              <div className="flex gap-3"><span className="text-xl">▣</span><div><p className={`text-sm font-semibold ${t.heading}`}>Store Pickup</p><p className={`text-xs ${t.sub}`}>Available during store hours</p></div></div>
              <p className={`text-xs sm:col-span-2 ${t.sub}`}>Store hours: 7:00 AM – 10:00 PM daily. Delivery charges, if applicable, are calculated at checkout.</p>
            </div>
          </div>
        </section>

        {/* Frequently Bought Together */}
        {frequentlyBought.length > 0 && (
          <section className={`mt-12 rounded-3xl border p-5 sm:p-7 ${t.card}`}>
            <h2 className={`text-xl font-bold ${t.heading}`}>Frequently Bought Together</h2>
            <p className={`mt-1 text-sm ${t.sub}`}>Select the products you'd like to add to your cart.</p>
            <div style={{ display: "flex", gap: "16px", overflowX: "auto", alignItems: "flex-start", flexWrap: "nowrap", paddingBottom: "12px", marginTop: "20px" }}>
              {frequentlyBought.map((item) => (
                <div key={item.id} style={{ width: "160px", minWidth: "160px", flex: "0 0 160px" }}>
                  <label className={`mb-2 flex cursor-pointer items-center gap-2 text-sm font-medium ${t.heading}`}>
                    <input type="checkbox" checked={selectedTogether.includes(item.id)} onChange={() => toggleTogetherProduct(item.id)} className="h-4 w-4 accent-[#101B2D]" /> Select
                  </label>
                  <Link to={`/products/${item.id}`} className={`flex h-32 items-center justify-center rounded-xl p-3 ${t.cardSoft}`}>
                    {getImageUrl(item) ? <img src={getImageUrl(item)} alt={item.name} className="h-full w-full object-contain" /> : <span className="text-3xl text-gray-300">▧</span>}
                  </Link>
                  <p className={`mt-2 line-clamp-2 text-sm font-semibold ${t.heading}`}>{item.name}</p>
                  <p className={`mt-1 text-sm font-bold ${t.heading}`}>{formatPrice(getDiscountedPrice(item))}</p>
                </div>
              ))}
            </div>
            <div className={`mt-4 flex flex-wrap items-center justify-between gap-4 border-t pt-4 ${t.border}`}>
              <div><p className={`text-xs ${t.sub}`}>Selected products total</p><p className={`text-xl font-bold ${t.heading}`}>{formatPrice(totalTogetherPrice)}</p></div>
              <button type="button" onClick={() => void handleAddSelectedTogether()} disabled={selectedTogether.length === 0 || adding} className={`rounded-xl px-5 py-3 text-sm font-bold disabled:opacity-50 ${t.btnPrimary}`}>Add Selected to Cart</button>
            </div>
          </section>
        )}

        {/* Product information tabs */}
        <section className={`mt-12 rounded-3xl border p-5 sm:p-7 ${t.card}`}>
          <div className={`flex gap-5 overflow-x-auto border-b ${t.border}`}>
            {([["description", "Description"], ["specifications", "Specifications"], ["reviews", "Reviews"]] as [Tab, string][]).map(([tab, label]) => (
              <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-semibold ${activeTab === tab ? "border-[#D6B875] " + (isDark ? "text-white" : "text-[#101B2D]") : (isDark ? "border-transparent text-gray-400" : "border-transparent text-gray-500")}`}>{label}</button>
            ))}
          </div>
          {activeTab === "description" && <div className={`pt-5 text-sm leading-7 ${t.body}`}>{product.description || "No description is available for this product."}</div>}
          {activeTab === "specifications" && (
            <div className="pt-5">
              {specifications.length ? (
                <div className={`divide-y ${t.divider}`}>
                  {specifications.map(([label, value]) => (<div key={String(label)} className="grid grid-cols-2 gap-4 py-3 text-sm"><span className={`font-medium ${t.sub}`}>{label}</span><span className={`break-words font-semibold ${t.heading}`}>{String(value)}</span></div>))}
                </div>
              ) : (<p className={`text-sm ${t.sub}`}>No specifications are available.</p>)}
            </div>
          )}
          {activeTab === "reviews" && (
            <div className="pt-5">
              <div className="mb-6"><p className={`text-2xl font-bold ${t.heading}`}>{reviews.length ? averageRating.toFixed(1) : "—"} / 5</p><p className={`mt-1 text-sm ${t.sub}`}>{reviews.length ? `${reviews.length} approved reviews` : "No approved reviews yet"}</p></div>
              {reviews.length > 0 ? (
                <div className="space-y-4">{reviews.map((review) => (<div key={review.id} className={`border-b pb-4 ${t.border}`}><p className="text-[#c08e28]">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</p>{review.review_text && <p className={`mt-2 text-sm leading-6 ${t.body}`}>{review.review_text}</p>}<p className="mt-2 text-xs text-gray-400">{new Date(review.created_at).toLocaleDateString("en-IN")}</p></div>))}</div>
              ) : (<p className={`text-sm ${t.sub}`}>Be the first to share your experience with this product.</p>)}
              <div className={`mt-7 rounded-2xl p-4 sm:p-5 ${t.reviewBox}`}>
                <h3 className={`font-bold ${t.heading}`}>{myReview ? "Edit Your Review" : "Write a Review"}</h3>
                {!user ? (<p className={`mt-2 text-sm ${t.body}`}>Please <Link to="/login" className="font-semibold underline">log in</Link> to write a review.</p>) : (
                  <>
                    {myReview && <p className="mt-2 text-xs text-[#80652e]">Your review status: {myReview.status}</p>}
                    <div className="mt-3 flex gap-2">{[1, 2, 3, 4, 5].map((rating) => (<button key={rating} type="button" onClick={() => setReviewRating(rating)} className={`text-2xl ${rating <= reviewRating ? "text-[#c08e28]" : "text-gray-300"}`} aria-label={`${rating} stars`}>★</button>))}</div>
                    <textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} rows={4} maxLength={2000} placeholder="Share your experience with this product..." className={`mt-3 w-full resize-y rounded-xl border p-3 text-sm outline-none focus:border-[#D6B875] ${t.input}`} />
                    <button type="button" onClick={() => void handleReviewSubmit()} disabled={reviewSubmitting} className={`mt-3 rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-50 ${t.btnPrimary}`}>{reviewSubmitting ? "Submitting..." : myReview ? "Update Review" : "Submit Review"}</button>
                    {reviewMessage && <p className="mt-3 text-sm text-[#80652e]" role="status">{reviewMessage}</p>}
                    <p className={`mt-3 text-xs ${t.sub}`}>Reviews are available to verified purchasers and are published after admin approval.</p>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Related products */}
        {relatedProducts.length > 0 && (
          <section className="mt-12">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div><h2 className={`text-xl font-bold ${t.heading}`}>Related Products</h2><p className={`mt-1 text-sm ${t.sub}`}>More products from this category</p></div>
              <div className="hidden gap-2 sm:flex">
                <button type="button" onClick={() => scrollCarousel("related-products", "left")} className={`h-9 w-9 rounded-full border ${t.card} ${t.heading}`} aria-label="Scroll related products left">←</button>
                <button type="button" onClick={() => scrollCarousel("related-products", "right")} className={`h-9 w-9 rounded-full border ${t.card} ${t.heading}`} aria-label="Scroll related products right">→</button>
              </div>
            </div>
            <div id="related-products" style={{ display: "flex", gap: "16px", overflowX: "auto", alignItems: "flex-start", flexWrap: "nowrap", paddingBottom: "16px" }}>
              {relatedProducts.map(renderProductCard)}
            </div>
          </section>
        )}

        {/* Recently viewed */}
        {recentProducts.length > 0 && (
          <section className="mt-10">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div><h2 className={`text-xl font-bold ${t.heading}`}>Recently Viewed</h2><p className={`mt-1 text-sm ${t.sub}`}>Products you've viewed recently</p></div>
              <div className="hidden gap-2 sm:flex">
                <button type="button" onClick={() => scrollCarousel("recent-products", "left")} className={`h-9 w-9 rounded-full border ${t.card} ${t.heading}`} aria-label="Scroll recently viewed products left">←</button>
                <button type="button" onClick={() => scrollCarousel("recent-products", "right")} className={`h-9 w-9 rounded-full border ${t.card} ${t.heading}`} aria-label="Scroll recently viewed products right">→</button>
              </div>
            </div>
            <div id="recent-products" style={{ display: "flex", gap: "16px", overflowX: "auto", alignItems: "flex-start", flexWrap: "nowrap", paddingBottom: "16px" }}>
              {recentProducts.map(renderProductCard)}
            </div>
          </section>
        )}
      </div>

      {/* Mobile sticky purchase bar */}
      <div className={`fixed bottom-0 left-0 right-0 z-40 border-t p-3 shadow-[0_-4px_15px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden ${isDark ? "border-[#2E3F5A] bg-[#0E1A2B]/95" : "border-[#e5dece] bg-white/95"}`}>
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1"><p className={`truncate text-xs ${t.sub}`}>{product.name}</p><p className={`font-bold ${t.heading}`}>{formatPrice(selectedProductPrice)}</p></div>
          {isOutOfStock ? (
            <button type="button" onClick={() => void handleNotifyMe()} disabled={notifyLoading} className={`rounded-xl px-4 py-3 text-sm font-bold ${t.btnPrimary}`}>{notifySubscribed ? "Cancel Alert" : "Notify Me"}</button>
          ) : (
            <>
              <button type="button" disabled={adding} onClick={() => { void handleAddToCart(product, purchaseMode, selectedValue, null); }} className={`rounded-xl border-2 px-3 py-3 text-xs font-bold ${t.btnOutline}`}>Add</button>
              <button type="button" disabled={adding} onClick={() => void handleBuyNow()} className={`rounded-xl px-4 py-3 text-xs font-bold ${t.btnPrimary}`}>Buy Now</button>
            </>
          )}
        </div>
      </div>

      {/* Image zoom */}
      {zoomOpen && activeImage && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 p-4" onClick={() => setZoomOpen(false)} role="dialog" aria-modal="true" aria-label="Product image zoom">
          <button type="button" onClick={() => setZoomOpen(false)} className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white text-2xl text-[#101B2D]" aria-label="Close image zoom">×</button>
          <img src={activeImage} alt={product.name} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
};

export default ProductDetails;