import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import type { Product } from "../types/product";
import type { Theme } from "../hooks/useTheme";

// --------------------------------------------------
// CONFIG  (adjust these to match your app)
// --------------------------------------------------

const ROUTES = {
  cart: "/cart",
  profile: "/profile",
  notifications: "/notifications",
};

const HISTORY_KEY = "gmart-search-history";
const MAX_HISTORY = 6;

const NAV_LINKS = [
  { label: "Home", id: "home" },
  { label: "Categories", id: "categories" },
  { label: "Brands", id: "brands" },
  { label: "Deals", id: "special-offers" },
];

const DRAWER_LINKS = [
  { label: "Home", id: "home" },
  { label: "Shop by category", id: "categories" },
  { label: "Shop by brand", id: "brands" },
  { label: "Today's deals", id: "special-offers" },
  { label: "Fresh arrivals", id: "recently-added" },
  { label: "All products", id: "products" },
];

// --------------------------------------------------
// ICONS
// --------------------------------------------------

const ICONS: Record<string, ReactNode> = {
  menu: <path d="M4 7h16M4 12h16M4 17h10" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 21h4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2l2.4 11h10.2L20 8H6.5" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="17" cy="19" r="1.5" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
};

function Icon({
  name,
  className = "h-[22px] w-[22px]",
}: {
  name: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {ICONS[name]}
    </svg>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  badge,
  solid = false,
  id,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  badge?: number;
  solid?: boolean;
  id?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      onClick={onClick}
      aria-label={label}
      className={`relative flex h-11 w-11 flex-none items-center justify-center rounded-full transition ${
        solid
          ? "bg-[#101B2D] text-white hover:bg-[#D6B875] hover:text-[#101B2D] dark:bg-[#D6B875] dark:text-[#101B2D] dark:hover:bg-white"
          : "text-[#101B2D] hover:bg-black/5 dark:text-[#F2EFE6] dark:hover:bg-white/10"
      }`}
    >
      <Icon name={icon} />

      {badge !== undefined && badge > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

// --------------------------------------------------
// SEARCH HELPERS
// --------------------------------------------------

function levenshtein(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;

    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }

  return row[b.length];
}

// Returns a corrected query ("basmti" -> "basmati") or null.
function findSuggestion(query: string, vocabulary: string[]): string | null {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  let changed = false;

  const fixed = words.map((word) => {
    if (word.length < 3 || vocabulary.some((v) => v.startsWith(word))) {
      return word;
    }

    const maxDistance = word.length <= 4 ? 1 : 2;
    let best = word;
    let bestDistance = maxDistance + 1;

    for (const candidate of vocabulary) {
      const distance = levenshtein(word, candidate);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }

    if (best !== word) changed = true;
    return best;
  });

  return changed ? fixed.join(" ") : null;
}

const loadHistory = (): string[] => {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string").slice(0, MAX_HISTORY)
      : [];
  } catch {
    return [];
  }
};

const persistHistory = (items: string[]) => {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage errors.
  }
};

const priceOf = (product: Product) => {
  const discounted = Number(product.discounted_price);
  if (discounted > 0) return discounted;

  const price = Number(product.price);
  const discount = Number(product.discount_percentage || 0);
  return Number((price * (1 - discount / 100)).toFixed(2));
};

function Highlight({ text, query }: { text: string; query: string }) {
  const index = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (index < 0) return <>{text}</>;

  return (
    <>
      {text.slice(0, index)}
      <b className="text-[#8A6D2F] dark:text-[#D6B875]">
        {text.slice(index, index + query.length)}
      </b>
      {text.slice(index + query.length)}
    </>
  );
}

// --------------------------------------------------
// HEADER
// --------------------------------------------------

interface SiteHeaderProps {
  products: Product[];
  theme: Theme;
  onToggleTheme: () => void;
  onSearch: (query: string) => void;
  logoSrc?: string;
  cartCount?: number;
  notificationCount?: number;
}

function SiteHeader({
  products,
  theme,
  onToggleTheme,
  onSearch,
  logoSrc,
  cartCount,
  notificationCount,
}: SiteHeaderProps) {
  const navigate = useNavigate();

  const [hidden, setHidden] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<string[]>(loadHistory);

  const trimmed = query.trim();
  const visible = !hidden || drawerOpen || searchOpen;

  // --------------------------------------------------
  // HIDE ON SCROLL DOWN, SHOW ON SCROLL UP
  // --------------------------------------------------

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;

      window.requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY;

        if (y <= 80) {
          setHidden(false);
          lastY = y;
        } else if (delta > 6) {
          setHidden(true);
          lastY = y;
        } else if (delta < -6) {
          setHidden(false);
          lastY = y;
        }

        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock page scroll while the drawer or search is open.
  useEffect(() => {
    if (!drawerOpen && !searchOpen) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen, searchOpen]);

  // Escape closes whichever panel is open.
  useEffect(() => {
    if (!drawerOpen && !searchOpen) return;

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDrawerOpen(false);
      setSearchOpen(false);
      setQuery("");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen, searchOpen]);

  // --------------------------------------------------
  // NAVIGATION
  // --------------------------------------------------

  const goTo = (id: string) => {
    setDrawerOpen(false);

    window.setTimeout(() => {
      if (id === "home") {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 60);
  };

  // --------------------------------------------------
  // SEARCH
  // --------------------------------------------------

  const vocabulary = useMemo(() => {
    const words = new Set<string>();

    products.forEach((product) => {
      `${product.name} ${product.category}`
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 3)
        .forEach((word) => words.add(word));
    });

    return Array.from(words);
  }, [products]);

  const suggestion = useMemo(
    () => (trimmed ? findSuggestion(trimmed, vocabulary) : null),
    [trimmed, vocabulary]
  );

  const matches = useMemo(() => {
    if (!trimmed) return [];

    const needles = [trimmed.toLowerCase()];
    if (suggestion) needles.push(suggestion);

    return products
      .filter(
        (product) =>
          product.is_available &&
          needles.some((needle) =>
            `${product.name} ${product.category}`
              .toLowerCase()
              .includes(needle)
          )
      )
      .slice(0, 5);
  }, [products, trimmed, suggestion]);

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };

  const saveHistory = (value: string) => {
    const next = [
      value,
      ...history.filter((item) => item.toLowerCase() !== value.toLowerCase()),
    ].slice(0, MAX_HISTORY);

    setHistory(next);
    persistHistory(next);
  };

  const removeHistory = (value: string) => {
    const next = history.filter((item) => item !== value);
    setHistory(next);
    persistHistory(next);
  };

  const clearHistory = () => {
    setHistory([]);
    persistHistory([]);
  };

  const submitSearch = (value: string) => {
    const clean = value.trim();
    if (!clean) return;

    saveHistory(clean);
    closeSearch();
    onSearch(clean);
  };

  const openProduct = (product: Product) => {
    saveHistory(product.name);
    closeSearch();
    navigate(`/products/${product.id}`);
  };

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  const logo = (
    <button
      type="button"
      onClick={() => goTo("home")}
      aria-label="G-MART home"
      className="flex flex-none items-center"
    >
      {logoSrc ? (
        <img src={logoSrc} alt="G-MART" className="h-9 w-auto" />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#101B2D] text-xl font-bold text-[#D6B875] dark:bg-[#D6B875] dark:text-[#101B2D]">
          G
        </span>
      )}
    </button>
  );

  return (
    <>
      <header
        className={`sticky top-0 z-50 bg-[#F7F5EF]/95 shadow-[0_1px_0_rgba(16,27,45,0.08)] backdrop-blur transition-transform duration-300 dark:bg-[#0B1220]/95 dark:shadow-[0_1px_0_rgba(255,255,255,0.1)] ${
          visible ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-3 sm:h-[76px] sm:px-6">
          {/* LEFT: HAMBURGER + LOGO */}

          <div className="flex items-center gap-1 sm:gap-3">
            <IconButton
              label="Open menu"
              icon="menu"
              onClick={() => setDrawerOpen(true)}
            />
            {logo}
          </div>

          {/* CENTER: LINKS (LAPTOP) */}

          <nav className="hidden items-center gap-8 text-[15px] font-medium text-[#101B2D] dark:text-[#F2EFE6] md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  goTo(link.id);
                }}
                className="transition hover:text-[#8A6D2F] dark:hover:text-[#D6B875]"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* RIGHT: SEARCH, NOTIFICATIONS, CART, PROFILE, THEME */}

          <div className="flex items-center">
            <IconButton
              label="Search"
              icon="search"
              onClick={() => setSearchOpen(true)}
            />
            <IconButton
              label="Notifications"
              icon="bell"
              badge={notificationCount}
              onClick={() => navigate(ROUTES.notifications)}
            />
            <IconButton
              id="gmart-cart-button"
              label="Cart"
              icon="cart"
              badge={cartCount}
              solid
              onClick={() => navigate(ROUTES.cart)}
            />
            <IconButton
              label="Profile"
              icon="user"
              onClick={() => navigate(ROUTES.profile)}
            />
            <IconButton
              label={
                theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
              }
              icon={theme === "dark" ? "sun" : "moon"}
              onClick={onToggleTheme}
            />
          </div>
        </div>

        {/* SECOND ROW: LINKS (MOBILE) */}

        <nav className="flex h-11 items-center gap-6 overflow-x-auto px-5 text-sm font-semibold text-[#101B2D] dark:text-[#F2EFE6] md:hidden">
          {NAV_LINKS.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              onClick={(event) => {
                event.preventDefault();
                goTo(link.id);
              }}
              className="py-2"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </header>

      {/* DRAWER */}

      <div
        className="fixed inset-0 z-[70]"
        aria-hidden={!drawerOpen}
        style={{
          visibility: drawerOpen ? "visible" : "hidden",
          transition: `visibility 0s linear ${drawerOpen ? "0s" : "0.3s"}`,
        }}
      >
        <div
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 bg-[#0B1220]/55 transition-opacity duration-300 ${
            drawerOpen ? "opacity-100" : "opacity-0"
          }`}
        />

        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={`absolute left-0 top-0 flex h-full w-80 max-w-[85%] flex-col bg-[#F7F5EF] p-5 shadow-2xl transition-transform duration-300 dark:bg-[#0B1220] ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between">
            {logo}
            <IconButton
              label="Close menu"
              icon="close"
              onClick={() => setDrawerOpen(false)}
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setDrawerOpen(false);
              navigate(ROUTES.profile);
            }}
            className="mt-6 flex items-center gap-3 rounded-2xl bg-[#101B2D] p-4 text-left dark:bg-[#1B2A44]"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#D6B875] text-[#101B2D]">
              <Icon name="user" className="h-6 w-6" />
            </span>

            <span>
              <span className="block font-semibold text-white">
                My profile
              </span>
              <span className="mt-0.5 block text-sm text-[#D6B875]">
                View your account
              </span>
            </span>
          </button>

          <div className="mt-3">
            {DRAWER_LINKS.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => goTo(link.id)}
                className="flex h-[52px] w-full items-center justify-between border-b border-[#101B2D]/10 text-base font-medium text-[#101B2D] dark:border-white/10 dark:text-[#F2EFE6]"
              >
                {link.label}
                <span className="text-[#8A6D2F] dark:text-[#D6B875]">›</span>
              </button>
            ))}
          </div>

          <div className="mt-auto text-sm text-gray-500 dark:text-[#9AA3B2]">
            <p className="font-semibold text-[#8A6D2F] dark:text-[#D6B875]">
              Store hours
            </p>
            <p className="mt-1">Every day: 7:00 AM – 10:00 PM</p>
          </div>
        </aside>
      </div>

      {/* SEARCH */}

      {searchOpen && (
        <div
          className="fixed inset-0 z-[60] bg-[#0B1220]/55"
          onClick={closeSearch}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search products"
            onClick={(event) => event.stopPropagation()}
            className="mx-auto mt-2 max-h-[calc(100vh-1rem)] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl dark:bg-[#162238] sm:mt-4 sm:p-6"
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitSearch(query);
              }}
              className="flex items-center gap-2"
            >
              <div className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-full bg-[#F7F5EF] px-4 text-[#101B2D] ring-2 ring-[#D6B875] dark:bg-[#0B1220] dark:text-[#F2EFE6]">
                <Icon name="search" className="h-5 w-5 flex-none" />

                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search products"
                  aria-label="Search products"
                  className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-gray-400"
                />

                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="flex-none text-gray-500 dark:text-[#9AA3B2]"
                  >
                    <Icon name="close" className="h-[18px] w-[18px]" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={closeSearch}
                className="h-11 flex-none px-2 text-sm font-semibold text-[#101B2D] dark:text-[#F2EFE6]"
              >
                Cancel
              </button>
            </form>

            {/* SUGGESTIONS */}

            {trimmed && (
              <div className="mt-5">
                {suggestion && (
                  <div className="flex flex-wrap items-center gap-2 text-[15px] text-[#101B2D] dark:text-[#F2EFE6]">
                    Did you mean
                    <button
                      type="button"
                      onClick={() => setQuery(suggestion)}
                      className="rounded-full bg-[#101B2D] px-4 py-1.5 font-semibold text-[#D6B875] dark:bg-[#D6B875] dark:text-[#101B2D]"
                    >
                      {suggestion}
                    </button>
                    ?
                  </div>
                )}

                <p className="mb-1 mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-[#9AA3B2]">
                  Matching products
                </p>

                {matches.length === 0 ? (
                  <p className="py-3 text-sm text-gray-500 dark:text-[#9AA3B2]">
                    No matching products found.
                  </p>
                ) : (
                  matches.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => openProduct(product)}
                      className="flex w-full items-center gap-3.5 rounded-xl py-2 text-left transition hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <span className="flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-[14px] bg-[#F1F0EB] dark:bg-[#24324D]">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt=""
                            className="h-full w-full object-contain p-1.5"
                          />
                        ) : (
                          <span className="text-2xl">🛍️</span>
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] text-[#101B2D] dark:text-[#F2EFE6]">
                          <Highlight text={product.name} query={trimmed} />
                        </span>
                        <span className="mt-0.5 block text-xs text-gray-500 dark:text-[#9AA3B2]">
                          {product.category} · {product.unit}
                        </span>
                      </span>

                      <span className="flex-none font-bold text-[#101B2D] dark:text-[#F2EFE6]">
                        ₹{priceOf(product).toFixed(2)}
                      </span>
                    </button>
                  ))
                )}

                <button
                  type="button"
                  onClick={() => submitSearch(query)}
                  className="mt-3 text-sm font-semibold text-[#8A6D2F] hover:underline dark:text-[#D6B875]"
                >
                  See all results for "{trimmed}" →
                </button>
              </div>
            )}

            {/* RECENT SEARCHES */}

            {history.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-[#9AA3B2]">
                    Recent searches
                  </p>

                  <button
                    type="button"
                    onClick={clearHistory}
                    className="text-sm font-semibold text-[#8A6D2F] dark:text-[#D6B875]"
                  >
                    Clear all
                  </button>
                </div>

                {history.map((item) => (
                  <div
                    key={item}
                    className="flex h-12 items-center gap-3 text-[15px] text-[#101B2D] dark:text-[#F2EFE6]"
                  >
                    <Icon
                      name="clock"
                      className="h-[18px] w-[18px] flex-none text-gray-500 dark:text-[#9AA3B2]"
                    />

                    <button
                      type="button"
                      onClick={() => submitSearch(item)}
                      className="min-w-0 flex-1 truncate text-left"
                    >
                      {item}
                    </button>

                    <button
                      type="button"
                      onClick={() => removeHistory(item)}
                      aria-label={`Remove ${item} from recent searches`}
                      className="flex h-8 w-8 flex-none items-center justify-center text-gray-500 dark:text-[#9AA3B2]"
                    >
                      <Icon name="close" className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default SiteHeader;
