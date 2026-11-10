import {
  Bell,
  Check,
  Clock3,
  Moon,
  Sun,
  CreditCard,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Package,
  RefreshCw,
  Search,
  ShoppingCart,
  Tag,
  UserRound,
  X,
  ClipboardList,
  Home,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";

import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import api from "../../services/api";
import { useTheme } from "../../hooks/useTheme";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import type { Product } from "../../types/product";

// --------------------------------------------------
// TYPES
// --------------------------------------------------

interface AddToCartEventDetail {
  productName: string;
  message: string;
  startX: number;
  startY: number;
}

interface CartToast {
  id: number;
  productName: string;
  message: string;
}

interface FlyingSparkle {
  id: number;
  startX: number;
  startY: number;
  deltaX: number;
  deltaY: number;
}

interface NotificationItem {
  id: number;
  title: string;
  message: string;
  notification_type: string;
  order_id: number | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationCount {
  total_notifications: number;
  unread_notifications: number;
}

// --------------------------------------------------
// FUZZY SEARCH HELPER
// --------------------------------------------------

function editDistance(a: string, b: string): number {
  const previous = Array.from(
    { length: b.length + 1 },
    (_, index) => index
  );

  for (let i = 1; i <= a.length; i++) {
    const current = [i];

    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }

    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
}

function matchesSearch(
  value: string | null | undefined,
  query: string
): boolean {
  if (!value) return false;

  const text = value.toLowerCase().trim();
  const search = query.toLowerCase().trim();

  if (text.includes(search)) return true;

  if (search.length < 3) return false;

  const words = text.split(/\s+/);

  return words.some(
    (word) =>
      word.startsWith(search) ||
      editDistance(word, search) <=
        Math.max(1, Math.floor(search.length * 0.3))
  );
}

// --------------------------------------------------
// CUSTOMER LAYOUT
// --------------------------------------------------

function CustomerLayout() {
  const { user, logout } = useAuth();
  const { cartCount } = useCart();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showFloatingMenu, setShowFloatingMenu] = useState(false);

  const [toast, setToast] = useState<CartToast | null>(null);
  const [sparkle, setSparkle] = useState<FlyingSparkle | null>(null);
  const [cartBouncing, setCartBouncing] = useState(false);

  // SEARCH STATE

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchProducts, setSearchProducts] = useState<Product[]>([]);

  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("gmart_recent_searches");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // NOTIFICATION STATE

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState("");

  const lastScrollY = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationId = useRef(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);

  const [notificationDropdownStyle, setNotificationDropdownStyle] =
    useState<CSSProperties>({});

  const [searchDropdownStyle, setSearchDropdownStyle] =
    useState<CSSProperties>({});

  const isHomePage = location.pathname === "/";

  // --------------------------------------------------
  // LOAD PRODUCTS FOR SEARCH
  // --------------------------------------------------

  useEffect(() => {
    let active = true;

    api
      .get<Product[]>("/products/")
      .then((response) => {
        if (active) {
          setSearchProducts(response.data);
        }
      })
      .catch((error) => {
        console.error("Could not load search products:", error);
      });

    return () => {
      active = false;
    };
  }, []);

  // --------------------------------------------------
  // LOAD NOTIFICATIONS
  // --------------------------------------------------

  const loadNotifications = async (showLoader = false) => {
    if (!user) return;

    if (showLoader) {
      setNotificationLoading(true);
    }

    try {
      const [notificationResponse, countResponse] = await Promise.all([
        api.get("/notifications/", {
          params: {
            skip: 0,
            limit: 5,
          },
        }),
        api.get<NotificationCount>("/notifications/count"),
      ]);

      const responseData = notificationResponse.data;

      // Supports either a direct array or a wrapped response.
      const notificationList: NotificationItem[] = Array.isArray(responseData)
        ? responseData
        : responseData.notifications ||
          responseData.items ||
          [];

      setNotifications(notificationList);

      setUnreadCount(
        countResponse.data.unread_notifications ??
          notificationList.filter((item) => !item.is_read).length
      );

      setNotificationError("");
    } catch (error) {
      console.error("Could not load notifications:", error);
      setNotificationError("Could not load notifications.");
    } finally {
      if (showLoader) {
        setNotificationLoading(false);
      }
    }
  };

  // Load when user logs in and refresh every 30 seconds.

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setNotificationOpen(false);
      return;
    }

    loadNotifications(true);

    const interval = window.setInterval(() => {
      loadNotifications();
    }, 30000);

    return () => {
      window.clearInterval(interval);
    };
  }, [user?.id]);

  // Refresh notifications when the page changes.

  useEffect(() => {
    if (user) {
      loadNotifications();
    }

    setNotificationOpen(false);
  }, [location.pathname]);

  // --------------------------------------------------
  // MARK NOTIFICATION AS READ
  // --------------------------------------------------

  const handleNotificationClick = async (
    notification: NotificationItem
  ) => {
    try {
      if (!notification.is_read) {
        await api.patch(
          `/notifications/${notification.id}/read`
        );

        setNotifications((previous) =>
          previous.map((item) =>
            item.id === notification.id
              ? { ...item, is_read: true }
              : item
          )
        );

        setUnreadCount((previous) => Math.max(0, previous - 1));
      }

      setNotificationOpen(false);

      if (notification.order_id !== null) {
        navigate(`/my-orders?orderId=${notification.order_id}`);
      } else {
        navigate("/my-notifications");
      }
    } catch (error) {
      console.error("Could not mark notification as read:", error);
      loadNotifications();
    }
  };

  // --------------------------------------------------
  // SEARCH RESULTS
  // --------------------------------------------------

  const filteredSearchProducts = useMemo(() => {
    const query = searchQuery.trim();

    if (!query) return [];

    return searchProducts
      .filter(
        (product) =>
          product.is_available &&
          product.stock > 0 &&
          (
            matchesSearch(product.name, query) ||
            matchesSearch(product.brand, query) ||
            matchesSearch(product.category, query)
          )
      )
      .slice(0, 6);
  }, [searchProducts, searchQuery]);

  // --------------------------------------------------
  // RECENT SEARCHES
  // --------------------------------------------------

  const saveRecentSearch = (value: string) => {
    const cleaned = value.trim();

    if (!cleaned) return;

    const updated = [
      cleaned,
      ...recentSearches.filter(
        (item) => item.toLowerCase() !== cleaned.toLowerCase()
      ),
    ].slice(0, 5);

    setRecentSearches(updated);

    localStorage.setItem(
      "gmart_recent_searches",
      JSON.stringify(updated)
    );
  };

  const handleRecentSearch = (value: string) => {
    setSearchQuery(value);
    setSearchFocused(true);
    searchInputRef.current?.focus();
  };

  const handleProductSearch = (product: Product) => {
    saveRecentSearch(product.name);

    setSearchQuery("");
    setSearchFocused(false);
    setSearchOpen(false);

    navigate(`/products/${product.id}`);
  };

  const handleSearchEnter = () => {
    if (filteredSearchProducts.length > 0) {
      handleProductSearch(filteredSearchProducts[0]);
    }
  };

  // --------------------------------------------------
  // SEARCH INPUT FOCUS
  // --------------------------------------------------

  useEffect(() => {
    if (searchOpen) {
      const isMobile = window.matchMedia("(max-width: 639px)").matches;

      if (isMobile) {
        mobileSearchInputRef.current?.focus();
      } else {
        searchInputRef.current?.focus();
      }
    }
  }, [searchOpen]);

  // --------------------------------------------------
  // RESPONSIVE SEARCH DROPDOWN POSITION
  // --------------------------------------------------

  useEffect(() => {
    if (!searchOpen || !searchFocused) return;

    const updateDropdownPosition = () => {
      const isMobile = window.matchMedia("(max-width: 639px)").matches;

      const input = isMobile
        ? mobileSearchInputRef.current
        : searchInputRef.current;

      if (!input) return;

      const rect = input.getBoundingClientRect();

      const dropdownWidth = Math.min(
        320,
        window.innerWidth - 32
      );

      const left = Math.max(
        16,
        Math.min(
          rect.right - dropdownWidth,
          window.innerWidth - dropdownWidth - 16
        )
      );

      setSearchDropdownStyle({
        position: "fixed",
        top: `${rect.bottom + 8}px`,
        left: `${left}px`,
        width: `${dropdownWidth}px`,
      });
    };

    updateDropdownPosition();

    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);

    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [searchOpen, searchFocused]);

// --------------------------------------------------
// RESPONSIVE NOTIFICATION DROPDOWN POSITION
// --------------------------------------------------

  useEffect(() => {
    if (!notificationOpen) return;

    const updateNotificationPosition = () => {
      const button = notificationButtonRef.current;

      if (!button) return;

      const rect = button.getBoundingClientRect();

      const dropdownWidth = Math.min(
        360,
        window.innerWidth - 24
      );

      const left = Math.max(
        12,
        Math.min(
          rect.right - dropdownWidth,
          window.innerWidth - dropdownWidth - 12
        )
      );

      setNotificationDropdownStyle({
        position: "fixed",
        top: `${rect.bottom + 8}px`,
        left: `${left}px`,
        width: `${dropdownWidth}px`,
      });
    };

    updateNotificationPosition();

    window.addEventListener("resize", updateNotificationPosition);
    window.addEventListener("scroll", updateNotificationPosition, true);

    return () => {
      window.removeEventListener("resize", updateNotificationPosition);
      window.removeEventListener("scroll", updateNotificationPosition, true);
    };
  }, [notificationOpen]);

  // --------------------------------------------------
  // SCROLL DIRECTION DETECTION
  // --------------------------------------------------

  useEffect(() => {
    lastScrollY.current = window.scrollY;
    setShowFloatingMenu(false);

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const difference = currentScrollY - lastScrollY.current;

      if (currentScrollY < 100) {
        setShowFloatingMenu(false);
      } else if (difference > 5) {
        setShowFloatingMenu(false);
        setSidebarOpen(false);
      } else if (difference < -5) {
        setShowFloatingMenu(true);
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // --------------------------------------------------
  // CLOSE SIDEBAR AFTER NAVIGATION
  // --------------------------------------------------

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname, location.hash]);


  // Scroll to homepage sections after navigation from any page.
  useEffect(() => {
    if (location.pathname !== "/" || !location.hash) return;

    const sectionId = location.hash.slice(1);

    const timer = window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);

    return () => window.clearTimeout(timer);
  }, [location.pathname, location.hash]);

  // --------------------------------------------------
  // ADD TO CART ANIMATION + TOAST
  // --------------------------------------------------

  useEffect(() => {
    const handleAddToCart = (event: Event) => {
      const customEvent =
        event as CustomEvent<AddToCartEventDetail>;

      const detail = customEvent.detail;

      if (!detail) return;

      const cartElement = document.querySelector(
        '[data-cart-target="header"]'
      );

      if (cartElement) {
        const cartRect = cartElement.getBoundingClientRect();

        const startX = detail.startX;
        const startY = detail.startY;

        const endX = cartRect.left + cartRect.width / 2;
        const endY = cartRect.top + cartRect.height / 2;

        animationId.current += 1;

        setSparkle({
          id: animationId.current,
          startX,
          startY,
          deltaX: endX - startX,
          deltaY: endY - startY,
        });
      }

      setToast({
        id: Date.now(),
        productName: detail.productName,
        message: detail.message,
      });

      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }

      toastTimer.current = setTimeout(() => {
        setToast(null);
      }, 3000);
    };

    window.addEventListener("gmart:add-to-cart", handleAddToCart);

    return () => {
      window.removeEventListener(
        "gmart:add-to-cart",
        handleAddToCart
      );

      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }

      if (bounceTimer.current) {
        clearTimeout(bounceTimer.current);
      }
    };
  }, []);

  // --------------------------------------------------
  // SPARKLE ARRIVAL
  // --------------------------------------------------

  const handleSparkleAnimationEnd = () => {
    setSparkle(null);
    setCartBouncing(true);

    if (bounceTimer.current) {
      clearTimeout(bounceTimer.current);
    }

    bounceTimer.current = setTimeout(() => {
      setCartBouncing(false);
    }, 450);
  };

  // --------------------------------------------------
  // LOGOUT
  // --------------------------------------------------

  const handleLogout = async () => {
    setSidebarOpen(false);
    setNotificationOpen(false);
    await logout();
    navigate("/");
  };

  // --------------------------------------------------
  // MENU ICON
  // --------------------------------------------------

  const MenuIcon = () => (
    <Menu size={23} strokeWidth={2} className="text-[#D6B875]" />
  );

  // --------------------------------------------------
  // SIDEBAR
  // --------------------------------------------------

  const sidebarContent = (
    <div className="flex h-full flex-col bg-[#101B2D] text-white">
      <div className="border-b border-white/10 px-5 py-6">
        {/* <h1 className="text-2xl font-black tracking-wider text-[#D6B875]"> */}
          {/* <img
          src="/src/assets/gmart-logo-header.png"
          alt="G-Mart"
          className="h-10 w-auto max-w-[140px] object-contain"
        />
        </h1>

        <p className="mt-1 text-xs tracking-widest text-gray-300">
             MENU
        </p> */}
        <div className="flex flex-col items-start gap-2">
  <img
    src="/src/assets/gmart-logo-header.png"
    alt="G-Mart"
    className="h-10 w-auto max-w-[140px] object-contain"
  />

  <span className="text-xs font-bold tracking-[0.2em] text-[#D6B875]">
    CUSTOMER MENU
  </span>
</div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        <div>
          <p className="mb-3 px-3 text-[10px] font-bold tracking-widest text-[#D6B875]">
            SHOPPING
          </p>

          <div className="space-y-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition ${
                  isActive
                    ? "bg-[#D6B875] font-bold text-[#101B2D]"
                    : "text-gray-300 hover:bg-[#1C2B42] hover:text-white"
                }`
              }
            >
              <span className="text-lg"><Home size={18} /></span>
              Home
            </NavLink>

            <Link
              to="/#categories"
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-gray-300 transition hover:bg-[#1C2B42] hover:text-white"
            >
              <Tag size={18} />
              Categories
            </Link>

            <Link
              to="/#products"
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-gray-300 transition hover:bg-[#1C2B42] hover:text-white"
            >
              <Package size={18} />
              Products
            </Link>

            <NavLink
              to="/offers"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition ${
                  isActive
                    ? "bg-[#D6B875] font-bold text-[#101B2D]"
                    : "text-gray-300 hover:bg-[#1C2B42] hover:text-white"
                }`
              }
            >
              <span className="text-lg"><Tag size={18} /></span>
              Offers & Deals
            </NavLink>

            <NavLink
              to="/cart"
              className={({ isActive }) =>
                `flex items-center justify-between rounded-lg px-3 py-3 text-sm transition ${
                  isActive
                    ? "bg-[#D6B875] font-bold text-[#101B2D]"
                    : "text-gray-300 hover:bg-[#1C2B42] hover:text-white"
                }`
              }
            >
              <span className="flex items-center gap-3">
                <span className="text-lg">🛒</span>
                Cart
              </span>

              <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">
                {cartCount}
              </span>
            </NavLink>
          </div>
        </div>

        <div>
          <p className="mb-3 px-3 text-[10px] font-bold tracking-widest text-[#D6B875]">
            MY ACCOUNT
          </p>

          <div className="space-y-1">
            {user?.role === "customer" ? (
              <NavLink
                to="/my-orders"
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition ${
                    isActive
                      ? "bg-[#D6B875] font-bold text-[#101B2D]"
                      : "text-gray-300 hover:bg-[#1C2B42] hover:text-white"
                  }`
                }
              >
                <span className="text-lg"><ClipboardList size={18} /></span>
                My Orders
              </NavLink>
            ) : (
              <button
                onClick={() => {
                  setSidebarOpen(false);
                  navigate("/login");
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-gray-300 transition hover:bg-[#1C2B42] hover:text-white"
              >
                <span className="text-lg"><ClipboardList size={18} /></span>
                My Orders
              </button>
            )}

            <NavLink
              to="/my-profile"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition ${
                  isActive
                    ? "bg-[#D6B875] font-bold text-[#101B2D]"
                    : "text-gray-300 hover:bg-[#1C2B42] hover:text-white"
                }`
              }
            >
              <span className="text-lg"><UserRound size={18} /></span>
              My Profile
            </NavLink>

            <NavLink
              to="/my-addresses"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition ${
                  isActive
                    ? "bg-[#D6B875] font-bold text-[#101B2D]"
                    : "text-gray-300 hover:bg-[#1C2B42] hover:text-white"
                }`
              }
            >
              <span className="text-lg"><MapPin size={18} /></span>
              My Addresses
            </NavLink>

            <NavLink
              to="/my-notifications"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center justify-between rounded-lg px-3 py-3 text-sm transition ${
                  isActive
                    ? "bg-[#D6B875] font-bold text-[#101B2D]"
                    : "text-gray-300 hover:bg-[#1C2B42] hover:text-white"
                }`
              }
            >
              <span className="flex items-center gap-3">
                <span className="text-lg"><Bell size={20} /></span>
                Notifications
              </span>

              {unreadCount > 0 && (
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </NavLink>
          </div>
        </div>

        {user && ["admin", "super_admin"].includes(user.role) && (
          <div>
            <p className="mb-3 px-3 text-[10px] font-bold tracking-widest text-[#D6B875]">
              ADMINISTRATION
            </p>

            <Link
              to="/admin"
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-gray-300 transition hover:bg-[#1C2B42] hover:text-white"
            >
              <span className="text-lg"><LayoutDashboard size={18} /></span>
              Admin Dashboard
            </Link>
          </div>
        )}
      </nav>

      <div className="border-t border-white/10 p-4">
        {user ? (
          <>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#D6B875] font-bold text-[#101B2D]">
                {user.full_name?.charAt(0)?.toUpperCase() || "U"}
              </div>

              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {user.full_name}
                </p>

                <p className="text-xs capitalize text-gray-400">
                  {user.role.replace("_", " ")}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full rounded-lg border border-white/20 px-3 py-2.5 text-sm font-semibold text-gray-300 transition hover:border-red-400 hover:bg-red-500/10 hover:text-red-400"
            >
              ↪ Logout
            </button>
          </>
        ) : (
          <Link
            to="/login"
            onClick={() => setSidebarOpen(false)}
            className="block w-full rounded-lg bg-[#D6B875] px-3 py-2.5 text-center text-sm font-bold text-[#101B2D] transition hover:bg-white"
          >
            Login / Register
          </Link>
        )}
      </div>
    </div>
  );

  // --------------------------------------------------
  // PAGE
  // --------------------------------------------------

  return (
    <div className="min-h-screen bg-[#F7F5EF] dark:bg-[#0E1A2B] dark:text-white">
      <style>{`
        @keyframes gmart-sparkle-flight {
          0% {
            transform: translate3d(0, 0, 0) scale(1);
            opacity: 1;
          }
          45% {
            transform: translate3d(
              calc(var(--fly-x) * 0.55),
              calc(var(--fly-y) * 0.55 - 35px),
              0
            ) scale(1.35);
            opacity: 1;
          }
          100% {
            transform: translate3d(var(--fly-x), var(--fly-y), 0) scale(0.25);
            opacity: 0;
          }
        }

        @keyframes gmart-cart-bounce {
          0%, 100% { transform: scale(1); }
          35% { transform: scale(1.3) rotate(-8deg); }
          70% { transform: scale(0.92) rotate(5deg); }
        }

        @keyframes gmart-toast-in {
          from { opacity: 0; transform: translateX(30px); }
          to { opacity: 1; transform: translateX(0); }
        }

        @keyframes gmart-toast-progress {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }

        .gmart-sparkle-flight {
          animation: gmart-sparkle-flight 650ms cubic-bezier(.2,.8,.3,1) forwards;
        }

        .gmart-cart-bounce {
          animation: gmart-cart-bounce 450ms ease;
        }

        .gmart-toast-in {
          animation: gmart-toast-in 300ms ease-out;
        }

        @media (prefers-reduced-motion: reduce) {
          .gmart-sparkle-flight,
          .gmart-cart-bounce,
          .gmart-toast-in {
            animation-duration: 1ms;
          }
        }
      `}</style>

      {/* HEADER */}

      <header className="relative z-40 bg-[#101B2D] text-white shadow-md">
        <nav className="mx-auto max-w-7xl px-2 py-3 sm:px-8 sm:py-4">

          {/* TOP ROW */}

          <div className="flex w-full min-w-0 flex-nowrap items-center justify-between gap-1 sm:gap-4">

            {/* HAMBURGER + LOGO */}

            <div className="flex min-w-0 shrink items-center gap-1 sm:gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open customer sidebar"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#D6B875]/40 bg-[#1C2B42] transition hover:bg-[#2b3b54] sm:h-10 sm:w-10"
              >
                <span className="sm:hidden">
                  <Menu size={19} className="text-[#D6B875]" />
                </span>
                <span className="hidden sm:block">
                  <Menu size={23} className="text-[#D6B875]" />
                </span>
              </button>

              <Link to="/" className="flex min-w-0 items-center">
                <img
                  src="/src/assets/gmart-logo-header.png"
                  alt="G-Mart"
                  className="h-8 w-auto max-w-[76px] shrink object-contain sm:h-12 sm:max-w-none"
                />
              </Link>
            </div>

            {/* HEADER ACTIONS */}

            <div className="flex shrink-0 flex-nowrap items-center gap-1 sm:gap-3">

              {/* MOBILE SEARCH BUTTON */}

              <button
                type="button"
                onClick={() => {
                  setSearchOpen((previous) => !previous);
                  setSearchFocused(true);
                }}
                aria-label="Open product search"
                title="Search products"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1C2B42] transition hover:bg-[#D6B875] hover:text-[#101B2D] sm:hidden"
              >
                {searchOpen ? <X size={17} /> : <Search size={17} />}
              </button>

              {/* DESKTOP SEARCH */}

              <div className="relative hidden items-center sm:flex">
                {!searchOpen ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchOpen(true);
                      setSearchFocused(true);
                    }}
                    aria-label="Open product search"
                    title="Search products"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1C2B42] transition hover:bg-[#D6B875] hover:text-[#101B2D]"
                  >
                    <Search size={20} />
                  </button>
                ) : (
                  <div className="relative w-56 md:w-64">
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      onFocus={() => setSearchFocused(true)}
                      onBlur={() => {
                        window.setTimeout(() => setSearchFocused(false), 150);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setSearchOpen(false);
                          setSearchFocused(false);
                          setSearchQuery("");
                        }

                        if (event.key === "Enter") {
                          handleSearchEnter();
                        }
                      }}
                      placeholder="Search products..."
                      aria-label="Search products"
                      className="h-10 w-full rounded-lg border border-[#D6B875]/50 bg-white px-3 pr-9 text-sm text-[#101B2D] outline-none focus:border-[#D6B875] focus:ring-2 focus:ring-[#D6B875]/30"
                    />

                    <button
                      type="button"
                      onClick={() => {
                        setSearchOpen(false);
                        setSearchFocused(false);
                        setSearchQuery("");
                      }}
                      aria-label="Close search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black"
                    >
                      <X size={16} />
                    </button>

                    {searchFocused && (
                      <div
                        style={searchDropdownStyle}
                        className="z-[100] max-h-80 overflow-x-hidden overflow-y-auto rounded-xl border border-gray-200 bg-white py-2 text-[#101B2D] shadow-2xl"
                      >
                        {!searchQuery.trim() ? (
                          <>
                            <div className="flex items-center justify-between px-4 py-2">
                              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                                Recent Searches
                              </p>

                              {recentSearches.length > 0 && (
                                <button
                                  type="button"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    setRecentSearches([]);
                                    localStorage.removeItem("gmart_recent_searches");
                                  }}
                                  className="text-xs text-gray-400 hover:text-red-500"
                                >
                                  Clear
                                </button>
                              )}
                            </div>

                            {recentSearches.length > 0 ? (
                              recentSearches.map((item) => (
                                <button
                                  key={item}
                                  type="button"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => handleRecentSearch(item)}
                                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-[#F7F5EF]"
                                >
                                  <Clock3 size={16} />
                                  {item}
                                </button>
                              ))
                            ) : (
                              <p className="px-4 py-3 text-sm text-gray-500">
                                Your recent searches will appear here.
                              </p>
                            )}
                          </>
                        ) : (
                          <>
                            <p className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                              Matching Products
                            </p>

                            {filteredSearchProducts.length > 0 ? (
                              filteredSearchProducts.map((product) => (
                                <button
                                  key={product.id}
                                  type="button"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => handleProductSearch(product)}
                                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[#F7F5EF]"
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-semibold">
                                      {product.name}
                                    </span>
                                    <span className="block text-xs text-gray-500">
                                      {product.category}
                                    </span>
                                  </span>

                                  <span className="shrink-0 text-sm font-bold text-[#8A6D25]">
                                    ₹{Number(product.discounted_price || product.price).toFixed(2)}
                                  </span>
                                </button>
                              ))
                            ) : (
                              <p className="px-4 py-3 text-sm text-gray-500">
                                No matching products found.
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* OFFERS */}

              <Link
                to="/offers"
                aria-label="Offers and deals"
                title="Offers & Deals"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1C2B42] transition hover:bg-[#D6B875] hover:text-[#101B2D] sm:h-10 sm:w-10"
              >
                <Tag size={17} className="sm:hidden" />
                <Tag size={20} className="hidden sm:block" />
              </Link>

              {/* NOTIFICATIONS */}

              {user && (
                <div className="relative">
                  <button
                    ref={notificationButtonRef}
                    type="button"
                    onClick={() => {
                      const nextOpen = !notificationOpen;
                      setNotificationOpen(nextOpen);

                      if (nextOpen) loadNotifications(true);
                    }}
                    aria-label={`Notifications, ${unreadCount} unread`}
                    aria-expanded={notificationOpen}
                    title="Notifications"
                    className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1C2B42] transition hover:bg-[#D6B875] hover:text-[#101B2D] sm:h-10 sm:w-10"
                  >
                    <Bell size={17} className="sm:hidden" />
                    <Bell size={20} className="hidden sm:block" />

                    {unreadCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-[#101B2D] sm:h-5 sm:min-w-5 sm:text-[10px]">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </button>

                  {notificationOpen && (
                    <>
                      <button
                        type="button"
                        aria-label="Close notifications"
                        onClick={() => setNotificationOpen(false)}
                        className="fixed inset-0 z-[90] cursor-default"
                      />

                      <div
                        style={notificationDropdownStyle}
                        className="z-[100] max-h-[min(420px,70vh)] overflow-hidden rounded-xl border border-gray-200 bg-white text-[#101B2D] shadow-2xl"
                      >
                        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                          <div>
                            <h3 className="font-bold">Notifications</h3>
                            <p className="text-xs text-gray-500">
                              {unreadCount} unread notifications
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => loadNotifications(true)}
                            title="Refresh notifications"
                            className="rounded-lg px-2 py-1 text-gray-500 transition hover:bg-gray-100 hover:text-[#8A6D25]"
                          >
                            <RefreshCw size={17} />
                          </button>
                        </div>

                        <div className="max-h-[360px] overflow-y-auto overscroll-y-contain">
                          {notificationLoading ? (
                            <div className="px-4 py-8 text-center text-sm text-gray-500">
                              Loading notifications...
                            </div>
                          ) : notificationError ? (
                            <div className="px-4 py-8 text-center text-sm text-red-500">
                              {notificationError}
                              <button
                                type="button"
                                onClick={() => loadNotifications(true)}
                                className="mt-2 block w-full font-semibold text-[#8A6D25]"
                              >
                                Try again
                              </button>
                            </div>
                          ) : notifications.length === 0 ? (
                            <div className="px-4 py-10 text-center">
                              <Bell size={20} className="mx-auto mb-2" />
                              <p className="text-sm font-semibold">No notifications yet</p>
                              <p className="mt-1 text-xs text-gray-500">
                                Your order updates will appear here.
                              </p>
                            </div>
                          ) : (
                            notifications.map((notification) => (
                              <button
                                key={notification.id}
                                type="button"
                                onClick={() => handleNotificationClick(notification)}
                                className={`flex w-full gap-3 border-b border-gray-100 px-4 py-3 text-left transition hover:bg-[#F7F5EF] ${
                                  !notification.is_read ? "bg-amber-50/70" : ""
                                }`}
                              >
                                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#D6B875]/20">
                                  {notification.notification_type?.toLowerCase().includes("payment") ? (
                                    <CreditCard size={18} />
                                  ) : notification.notification_type?.toLowerCase().includes("order") ? (
                                    <Package size={18} />
                                  ) : (
                                    <Bell size={18} />
                                  )}
                                </span>

                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center justify-between gap-2">
                                    <span className="truncate text-sm font-bold">
                                      {notification.title}
                                    </span>
                                    {!notification.is_read && (
                                      <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                                    )}
                                  </span>

                                  <span className="mt-1 block text-xs leading-relaxed text-gray-600">
                                    {notification.message}
                                  </span>

                                  <span className="mt-1 block text-[10px] text-gray-400">
                                    {new Date(notification.created_at).toLocaleString()}
                                  </span>
                                </span>
                              </button>
                            ))
                          )}
                        </div>

                        <Link
                          to="/my-notifications"
                          onClick={() => setNotificationOpen(false)}
                          className="block border-t border-gray-100 bg-[#F7F5EF] px-4 py-3 text-center text-sm font-bold text-[#8A6D25] transition hover:bg-[#D6B875]/20"
                        >
                          View all notifications →
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              )}
              
                            {/* THEME TOGGLE */}

              <button
                type="button"
                onClick={toggleTheme}
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                title={isDark ? "Light mode" : "Dark mode"}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1C2B42] transition hover:bg-[#D6B875] hover:text-[#101B2D] sm:h-10 sm:w-10"
              >
                {isDark ? (
                  <>
                    <Sun size={17} className="sm:hidden" />
                    <Sun size={20} className="hidden sm:block" />
                  </>
                ) : (
                  <>
                    <Moon size={17} className="sm:hidden" />
                    <Moon size={20} className="hidden sm:block" />
                  </>
                )}
              </button>

              {/* CART */}

              <Link
                to="/cart"
                data-cart-target="header"
                aria-label={`Shopping cart, ${cartCount} items`}
                title="Shopping Cart"
                className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1C2B42] transition hover:bg-[#D6B875] hover:text-[#101B2D] sm:h-10 sm:w-10"
              >
                <ShoppingCart size={17} className="sm:hidden" />
                <ShoppingCart size={20} className="hidden sm:block" />

                {cartCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white sm:h-5 sm:min-w-5 sm:text-[10px]">
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                )}
              </Link>

              {/* PROFILE */}

              <Link
                to={user ? "/my-profile" : "/login"}
                aria-label="My Profile"
                title="My Profile"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1C2B42] transition hover:bg-[#D6B875] hover:text-[#101B2D] sm:h-10 sm:w-10"
              >
                <UserRound size={17} className="sm:hidden" />
                <UserRound size={20} className="hidden sm:block" />
              </Link>
            </div>
          </div>

          {/* MOBILE SEARCH ROW */}

          {searchOpen && (
            <div className="relative mt-3 sm:hidden">
              <input
                ref={mobileSearchInputRef}
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => {
                  window.setTimeout(() => setSearchFocused(false), 150);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setSearchOpen(false);
                    setSearchFocused(false);
                    setSearchQuery("");
                  }

                  if (event.key === "Enter") {
                    handleSearchEnter();
                  }
                }}
                placeholder="Search products..."
                aria-label="Search products"
                className="h-11 w-full rounded-lg border border-[#D6B875]/50 bg-white px-4 pr-11 text-sm text-[#101B2D] outline-none focus:border-[#D6B875] focus:ring-2 focus:ring-[#D6B875]/30"
              />

              <button
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  setSearchFocused(false);
                  setSearchQuery("");
                }}
                aria-label="Close search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black"
              >
                <X size={18} />
              </button>

              {searchFocused && (
                <div
                  style={searchDropdownStyle}
                  className="z-[100] max-h-80 overflow-x-hidden overflow-y-auto rounded-xl border border-gray-200 bg-white py-2 text-[#101B2D] shadow-2xl"
                >
                  {!searchQuery.trim() ? (
                    <>
                      <div className="flex items-center justify-between px-4 py-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                          Recent Searches
                        </p>

                        {recentSearches.length > 0 && (
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setRecentSearches([]);
                              localStorage.removeItem("gmart_recent_searches");
                            }}
                            className="text-xs text-gray-400 hover:text-red-500"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      {recentSearches.length > 0 ? (
                        recentSearches.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleRecentSearch(item)}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-[#F7F5EF]"
                          >
                            <Clock3 size={16} />
                            {item}
                          </button>
                        ))
                      ) : (
                        <p className="px-4 py-3 text-sm text-gray-500">
                          Your recent searches will appear here.
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                        Matching Products
                      </p>

                      {filteredSearchProducts.length > 0 ? (
                        filteredSearchProducts.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleProductSearch(product)}
                            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[#F7F5EF]"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold">
                                {product.name}
                              </span>
                              <span className="block text-xs text-gray-500">
                                {product.category}
                              </span>
                            </span>

                            <span className="shrink-0 text-sm font-bold text-[#8A6D25]">
                              ₹{Number(product.discounted_price || product.price).toFixed(2)}
                            </span>
                          </button>
                        ))
                      ) : (
                        <p className="px-4 py-3 text-sm text-gray-500">
                          No matching products found.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SECOND ROW NAVIGATION - ALWAYS LEFT ALIGNED */}

          <div className="mt-3 flex w-full items-center justify-start gap-5 overflow-x-auto whitespace-nowrap border-t border-white/10 pt-3 text-xs font-medium sm:gap-7 sm:text-sm">
            <Link to="/#home" className="shrink-0 transition hover:text-[#D6B875]">
              Home
            </Link>

            <Link to="/#categories" className="shrink-0 transition hover:text-[#D6B875]">
              Categories
            </Link>

            <Link to="/#products" className="shrink-0 transition hover:text-[#D6B875]">
              Products
            </Link>

            <Link to="/offers" className="shrink-0 transition hover:text-[#D6B875]">
              Offers
            </Link>
          </div>

        </nav>
      </header>


    <Outlet />

      {/* FLYING GOLD SPARKLE */}

      {sparkle && (
        <div
          key={sparkle.id}
          onAnimationEnd={handleSparkleAnimationEnd}
          className="gmart-sparkle-flight pointer-events-none fixed z-[120] flex h-4 w-4 items-center justify-center rounded-full bg-[#D6B875] text-[11px] text-[#101B2D] shadow-[0_0_16px_5px_rgba(100,200,120,0.55)]"
          style={
            {
              left: sparkle.startX - 8,
              top: sparkle.startY - 8,
              "--fly-x": `${sparkle.deltaX}px`,
              "--fly-y": `${sparkle.deltaY}px`,
            } as CSSProperties
          }
        >
          ✦
        </div>
      )}

      {/* SUCCESS TOAST */}

      {toast && (
        <div
          key={toast.id}
          className="gmart-toast-in fixed right-4 top-5 z-[110] w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-xl border border-[#D6B875]/40 bg-[#101B2D] text-white shadow-2xl sm:right-6"
        >
          <div className="flex items-start gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-xl text-[#D6B875]">
              ✓
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-bold text-[#D6B875]">
                Added to cart successfully!
              </p>

              <p className="mt-1 truncate text-sm text-white">
                {toast.productName}
              </p>

              <p className="mt-1 text-xs text-gray-300">
                {toast.message}
              </p>

              <Link
                to="/cart"
                onClick={() => setToast(null)}
                className="mt-3 inline-block text-sm font-bold text-[#D6B875] transition hover:text-white"
              >
                View Cart →
              </Link>
            </div>

            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Close notification"
              className="text-gray-400 transition hover:text-white"
            >
              <X size={16} />
            </button>
          </div>

          <div className="h-1 w-full bg-[#1C2B42]">
            <div className="h-full origin-left animate-[gmart-toast-progress_3s_linear_forwards] bg-[#D6B875]" />
          </div>
        </div>
      )}

      {/* FLOATING MENU */}

      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open customer sidebar"
        className={`fixed left-4 top-4 z-[60] flex h-12 w-12 items-center justify-center rounded-xl border border-[#D6B875]/40 bg-[#101B2D] shadow-xl transition-all duration-300 ease-out hover:scale-105 hover:bg-[#1C2B42] ${
          showFloatingMenu && !sidebarOpen
            ? "translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-5 scale-75 opacity-0"
        }`}
      >
        <MenuIcon />
      </button>

      {/* SIDEBAR BACKDROP */}

      <div
        onClick={() => setSidebarOpen(false)}
        className={`fixed inset-0 z-[70] bg-black/50 transition-opacity duration-300 ${
          sidebarOpen ? "visible opacity-100" : "invisible opacity-0"
        }`}
      />

      {/* ANIMATED SIDEBAR */}

      <aside
        className={`fixed inset-y-0 left-0 z-[80] w-72 max-w-[85vw] shadow-2xl transition-transform duration-300 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>
    </div>
  );
}

export default CustomerLayout;
  