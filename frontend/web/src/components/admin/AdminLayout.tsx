import { useEffect, useRef, useState } from "react";
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  Bell,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Tag,
  TicketPercent,
  Users,
  PanelsTopLeft,
  UserRound,
  Eye,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";

// --------------------------------------------------
// TYPES
// --------------------------------------------------

interface NotificationCount {
  total_notifications: number;
  unread_notifications: number;
}

// --------------------------------------------------
// SIDEBAR NAVIGATION
// --------------------------------------------------

const navigationGroups = [
  {
    title: "MAIN MENU",
    items: [
      {
        label: "Dashboard",
        path: "/admin",
        icon: LayoutDashboard,
        active: true,
        permission: "dashboard",
      },
      {
        label: "Homepage Management",
        path: "/admin/homepage",
        icon: PanelsTopLeft,
        active: true,
        permission: "homepage",
      },
    ],
  },
  {
    title: "PRODUCT MANAGEMENT",
    items: [
      {
        label: "Products",
        path: "/admin/products",
        icon: Package,
        active: true,
        permission: "products",
      },
      {
        label: "Categories",
        path: "/admin/categories",
        icon: Tag,
        active: true,
        permission: "categories",
      },
      {
        label: "Inventory",
        path: "/admin/inventory",
        icon: ClipboardList,
        active: true,
        permission: "inventory",
      },
    ],
  },
  {
    title: "SALES & CUSTOMERS",
    items: [
      {
        label: "Orders",
        path: "/admin/orders",
        icon: ShoppingCart,
        active: true,
        permission: "orders",
      },
      {
        label: "Customers",
        path: "/admin/customers",
        icon: Users,
        active: true,
        permission: "customers",
      },
      {
        label: "Coupons",
        path: "/admin/coupons",
        icon: TicketPercent,
        active: true,
        permission: "coupons",
      },
      {
        label: "Payments",
        path: "/admin/payments",
        icon: CreditCard,
        active: true,
        permission: "orders",
      },
      {
        label: "Refunds",
        path: "/admin/refunds",
        icon: RotateCcw,
        active: false,
      },
    ],
  },
  {
    title: "COMMUNICATION",
    items: [
      {
        label: "Notifications",
        path: "/admin/notifications",
        icon: Bell,
        active: true,
        permission: "notifications",
      },
    ],
  },
  {
    title: "CONFIGURATION",
    items: [
      {
        label: "Store Settings",
        path: "/admin/settings",
        icon: Settings,
        active: true,
        permission: "settings",
      },
      {
        label: "Admin Management",
        path: "/admin/admins",
        icon: ShieldCheck,
        active: true,
        superAdminOnly: true,
      },
    ],
  },
];

// --------------------------------------------------
// ADMIN SECTION ROUTES
// --------------------------------------------------

const sectionRoutes: Record<string, string> = {
  "/admin": "dashboard",
  "/admin/products": "products",
  "/admin/categories": "categories",
  "/admin/inventory": "inventory",
  "/admin/orders": "orders",
  "/admin/settings": "settings",
  "/admin/homepage": "homepage",
  "/admin/customers": "customers",
  "/admin/coupons": "coupons",
  "/admin/notifications": "notifications",
  "/admin/payments": "orders",
};

// --------------------------------------------------
// ADMIN LAYOUT
// --------------------------------------------------

function AdminLayout() {
  const { user, loading, logout } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showFloatingMenu, setShowFloatingMenu] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const lastScrollY = useRef(0);

  const isSuperAdmin = user?.role === "super_admin";

  // --------------------------------------------------
  // FILTER SIDEBAR BY PERMISSIONS
  // --------------------------------------------------

  const visibleNavigationGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if ("superAdminOnly" in item && item.superAdminOnly) {
          return isSuperAdmin;
        }

        if (!item.active) {
          return true;
        }

        if (isSuperAdmin) {
          return true;
        }

        return (
          "permission" in item &&
          !!item.permission &&
          user?.section_permissions?.[item.permission] === true
        );
      }),
    }))
    .filter((group) => group.items.length > 0);

  // --------------------------------------------------
  // FIND FIRST ACCESSIBLE SECTION
  // --------------------------------------------------

  const firstAllowedPath = navigationGroups
    .flatMap((group) => group.items)
    .find(
      (item) =>
        item.active &&
        "permission" in item &&
        !!item.permission &&
        user?.section_permissions?.[item.permission] === true
    )?.path;

  // --------------------------------------------------
  // CHECK CURRENT ROUTE PERMISSION
  // --------------------------------------------------

  const isAdminManagementPath =
    location.pathname === "/admin/admins" ||
    location.pathname === "/admin/management";

  const currentSection = sectionRoutes[location.pathname];

  const currentSectionAllowed =
    isSuperAdmin ||
    (!isAdminManagementPath &&
      (!currentSection ||
        user?.section_permissions?.[currentSection] === true));

  const hasAnyPermission =
    isSuperAdmin ||
    Object.values(user?.section_permissions || {}).some(
      (permission) => permission === true
    );

  // --------------------------------------------------
  // ADMIN UNREAD NOTIFICATION COUNT
  // --------------------------------------------------

  useEffect(() => {
    if (loading || !user) return;

    let isMounted = true;

    const loadUnreadCount = async () => {
      try {
        const response = await api.get<NotificationCount>(
          "/notifications/count"
        );

        if (isMounted) {
          setUnreadCount(
            response.data.unread_notifications || 0
          );
        }
      } catch (error) {
        console.error(
          "Failed to load unread notification count:",
          error
        );
      }
    };

    loadUnreadCount();

    const interval = window.setInterval(
      loadUnreadCount,
      30000
    );

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [user, loading, location.pathname]);

  // --------------------------------------------------
  // SHOW MENU ONLY WHEN USER SCROLLS UP
  // --------------------------------------------------

  useEffect(() => {
    lastScrollY.current = window.scrollY;

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
  }, [location.pathname]);

  // --------------------------------------------------
  // ADMIN AUTHENTICATION
  // --------------------------------------------------

  useEffect(() => {
    if (loading) return;

    if (!user || !["admin", "super_admin"].includes(user.role)) {
      navigate("/login", { replace: true });
    }
  }, [user, loading, navigate]);

  // --------------------------------------------------
  // PROTECT ADMIN ROUTES
  // --------------------------------------------------

  useEffect(() => {
    if (loading || !user) return;

    if (user.role === "super_admin") return;

    if (user.role !== "admin") return;

    if (!currentSectionAllowed && firstAllowedPath) {
      navigate(firstAllowedPath, { replace: true });
    }
  }, [
    user,
    loading,
    currentSectionAllowed,
    firstAllowedPath,
    navigate,
  ]);

  // --------------------------------------------------
  // LOGOUT
  // --------------------------------------------------

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  // --------------------------------------------------
  // OPEN CUSTOMER HOMEPAGE
  // --------------------------------------------------

  const openCustomerView = () => {
    window.open("/", "_blank", "noopener,noreferrer");
    setSidebarOpen(false);
  };

  // --------------------------------------------------
  // LOADING SCREEN
  // --------------------------------------------------

  if (
    loading ||
    !user ||
    !["admin", "super_admin"].includes(user.role)
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F5EF]">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-[#D6B875]" />

          <p className="text-sm text-gray-600">
            Loading admin panel...
          </p>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // NO PERMISSION SCREEN
  // --------------------------------------------------

  if (!hasAnyPermission) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F5EF] px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <ShieldCheck
            size={42}
            className="mx-auto mb-4 text-[#D6B875]"
          />

          <h1 className="mb-2 text-xl font-bold text-[#101B2D]">
            No Admin Access
          </h1>

          <p className="text-sm leading-6 text-gray-600">
            You currently do not have permission to access any admin
            sections. Please contact your Super Admin to request access.
          </p>

          <button
            onClick={handleLogout}
            className="mt-6 rounded-lg bg-[#101B2D] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#1C2B42]"
          >
            Log Out
          </button>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // REDIRECTING SCREEN
  // --------------------------------------------------

  if (!currentSectionAllowed && firstAllowedPath) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F5EF]">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-[#D6B875]" />

          <p className="text-sm text-gray-600">
            Redirecting...
          </p>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // MENU ICON
  // --------------------------------------------------

  const MenuIcon = ({ size = 23 }: { size?: number }) => (
    <Menu
      size={size}
      strokeWidth={2}
      className="text-[#D6B875]"
    />
  );

  // --------------------------------------------------
  // SIDEBAR CONTENT
  // --------------------------------------------------

  const sidebarContent = (
    <div className="flex h-full flex-col bg-[#101B2D] text-white">

      {/* BRAND LOGO */}

      <div className="border-b border-white/10 px-5 py-6">
        <div className="flex flex-col items-start gap-2">
          <img
            src="/src/assets/gmart-logo-header.png"
            alt="G-Mart"
            className="h-10 w-auto max-w-[140px] object-contain"
          />

          <span className="text-xs font-bold tracking-[0.2em] text-[#D6B875]">
            ADMIN MENU
          </span>
        </div>
      </div>

      {/* NAVIGATION */}

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {visibleNavigationGroups.map((group) => (
          <div key={group.title}>
            <p className="mb-3 px-3 text-[10px] font-bold tracking-widest text-[#D6B875]">
              {group.title}
            </p>

            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;

                return item.active ? (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === "/admin"}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-all duration-200 ${
                        isActive
                          ? "bg-[#D6B875] font-bold text-[#101B2D] shadow-md"
                          : "text-gray-300 hover:bg-[#1C2B42] hover:text-white"
                      }`
                    }
                  >
                    <Icon size={19} strokeWidth={1.9} />
                    <span>{item.label}</span>
                  </NavLink>
                ) : (
                  <div
                    key={item.path}
                    className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-3 text-sm text-gray-500"
                    title="Coming soon"
                  >
                    <span className="flex items-center gap-3">
                      <Icon size={19} strokeWidth={1.9} />
                      {item.label}
                    </span>

                    <span className="rounded bg-white/10 px-2 py-0.5 text-[9px]">
                      Soon
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* CUSTOMER VIEW */}

        <div>
          <p className="mb-3 px-3 text-[10px] font-bold tracking-widest text-[#D6B875]">
            CUSTOMER VIEW
          </p>

          <button
            type="button"
            onClick={openCustomerView}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-gray-300 transition-all duration-200 hover:bg-[#1C2B42] hover:text-white"
          >
            <Eye size={19} strokeWidth={1.9} />
            <span>View Customer Homepage</span>
          </button>
        </div>
      </nav>

      {/* ADMIN PROFILE */}

      <div className="border-t border-white/10 p-4">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#D6B875] font-bold text-[#101B2D]">
            {user.full_name?.charAt(0)?.toUpperCase() || "A"}
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
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 px-3 py-2.5 text-sm font-semibold text-gray-300 transition hover:border-red-400 hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut size={17} />
          Logout
        </button>
      </div>
    </div>
  );

  // --------------------------------------------------
  // MAIN LAYOUT
  // --------------------------------------------------

  return (
    <div className="min-h-screen bg-[#F7F5EF]">

      {/* ADMIN HEADER */}

      <header className="relative z-40 bg-[#101B2D] text-white shadow-md">
        <nav className="mx-auto flex min-h-[76px] max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:px-8 sm:py-4">

          {/* HAMBURGER + LOGO */}

          <div className="flex min-w-0 items-center gap-2 sm:gap-3">

            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open admin sidebar"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#D6B875]/40 bg-[#1C2B42] transition hover:bg-[#2b3b54] sm:h-10 sm:w-10"
            >
              <span className="sm:hidden">
                <MenuIcon size={19} />
              </span>

              <span className="hidden sm:block">
                <MenuIcon size={23} />
              </span>
            </button>

            <NavLink
              to="/admin"
              className="flex min-w-0 items-center"
              aria-label="G-Mart Admin Dashboard"
            >
              <img
                src="/src/assets/gmart-logo-header.png"
                alt="G-Mart"
                className="h-8 w-auto max-w-[76px] object-contain sm:h-12 sm:max-w-none"
              />
            </NavLink>
          </div>

          {/* ADMIN IDENTITY + NOTIFICATIONS */}

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">

            {/* NOTIFICATION ICON */}

            {(isSuperAdmin ||
              user.section_permissions?.notifications === true) && (
              <NavLink
                to="/admin/notifications"
                aria-label={`Admin notifications${
                  unreadCount > 0
                    ? `, ${unreadCount} unread`
                    : ""
                }`}
                className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[#D6B875]/30 bg-[#1C2B42] text-[#D6B875] transition hover:bg-[#2b3b54] sm:h-10 sm:w-10"
              >
                <Bell size={19} />

                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[#101B2D] bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </NavLink>
            )}

            {/* PROFILE DROPDOWN */}

            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((prev) => !prev)}
                aria-label="Admin profile"
                aria-expanded={profileMenuOpen}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#D6B875]/40 bg-[#D6B875] text-[#101B2D] transition hover:scale-105 sm:h-10 sm:w-10"
              >
                <UserRound size={20} />
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 top-12 z-[100] w-60 overflow-hidden rounded-xl border border-gray-200 bg-white text-[#101B2D] shadow-xl">

                  <div className="border-b border-gray-100 px-4 py-4">
                    <p className="truncate text-sm font-bold">
                      {user.full_name}
                    </p>

                    <p className="mt-1 text-xs capitalize text-gray-500">
                      {user.role.replace("_", " ")}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      handleLogout();
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                  >
                    <LogOut size={17} />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </nav>
      </header>

      {/* PAGE CONTENT */}

      <main className="px-4 py-6 sm:px-8 sm:py-8">
        <Outlet />
      </main>

      {/* FLOATING MENU */}

      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open admin sidebar"
        className={`fixed left-4 top-4 z-[60] flex h-12 w-12 items-center justify-center rounded-xl border border-[#D6B875]/40 bg-[#101B2D] shadow-xl transition-all duration-300 ease-out hover:scale-105 hover:bg-[#1C2B42] ${
          showFloatingMenu && !sidebarOpen
            ? "translate-y-0 scale-100 opacity-100"
            : "-translate-y-5 scale-75 pointer-events-none opacity-0"
        }`}
      >
        <MenuIcon />
      </button>

      {/* SIDEBAR BACKDROP */}

      <div
        onClick={() => setSidebarOpen(false)}
        className={`fixed inset-0 z-[70] bg-black/50 transition-opacity duration-300 ${
          sidebarOpen
            ? "visible opacity-100"
            : "invisible opacity-0"
        }`}
      />

      {/* ANIMATED SIDEBAR DRAWER */}

      <aside
        className={`fixed inset-y-0 left-0 z-[80] w-72 max-w-[85vw] shadow-2xl transition-transform duration-300 ease-in-out ${
          sidebarOpen
            ? "translate-x-0"
            : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>
    </div>
  );
}

export default AdminLayout;