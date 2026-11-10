
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type { Product } from "../types/product";
import { useAuth } from "./AuthContext";
import api from "../services/api";

export type PurchaseMode = "quantity" | "amount";

export interface CartItem {
  product: Product;
  quantity: number;
  purchase_mode: PurchaseMode;
  purchase_amount: number | null;
}

interface CartContextType {
  items: CartItem[];
  cartCount: number;
  subtotal: number;

  addToCart: (
    product: Product,
    mode: PurchaseMode,
    value: number
  ) => Promise<boolean>;

  updateCartItem: (
    productId: number,
    mode: PurchaseMode,
    value: number
  ) => void;

  removeFromCart: (productId: number) => void;
  clearCart: () => void;
}

interface BackendCartItem {
  id: number;
  product_id: number;
  name: string;
  description: string | null;
  brand: string | null;
  category: string;
  price: string | number;
  mrp: string | number | null;
  image_url: string | null;
  unit: string;
  discount_percentage: string | number;
  discounted_price: string | number;
  quantity: string | number;
  purchase_mode: PurchaseMode;
  purchase_amount: string | number | null;
  allow_purchase_by_amount: boolean;
  stock: number;
  is_available: boolean;
}

interface BackendCartResponse {
  items: BackendCartItem[];
}

interface ApiError {
  response?: {
    data?: {
      detail?: string;
    };
  };
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const STORAGE_KEY = "gmart_cart";

const DISCRETE_UNITS = ["piece", "packet", "bottle"];
const MEASUREMENT_UNITS = ["kg", "g", "litre", "ml"];

function getDiscountedPrice(product: Product): number {
  const price = Number(product.price);
  const discount = Number(product.discount_percentage || 0);

  return Number((price * (1 - discount / 100)).toFixed(2));
}

function getQuantityFromAmount(
  product: Product,
  amount: number
): number {
  const unitPrice = getDiscountedPrice(product);

  if (unitPrice <= 0 || amount <= 0) return 0;

  return Number((amount / unitPrice).toFixed(12));
}

// Convert backend cart response into frontend CartItem objects.
function mapBackendCart(data: BackendCartResponse): CartItem[] {
  return data.items.map((item) => {
    const product: Product = {
      id: item.product_id,
      name: item.name,
      description: item.description,
      brand: item.brand,
      category: item.category,
      price: item.price,
      mrp: item.mrp,
      discount_percentage: item.discount_percentage,
      discounted_price: item.discounted_price,
      unit: item.unit,
      allow_purchase_by_amount: item.allow_purchase_by_amount,
      stock: item.stock,
      image_url: item.image_url,
      is_available: item.is_available,
    };

    return {
      product,
      quantity: Number(item.quantity),
      purchase_mode: item.purchase_mode,
      purchase_amount:
        item.purchase_amount === null
          ? null
          : Number(item.purchase_amount),
    };
  });
}

function getErrorMessage(error: unknown): string {
  const apiError = error as ApiError;

  return (
    apiError.response?.data?.detail ||
    "Something went wrong. Please try again."
  );
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const savedCart = localStorage.getItem(STORAGE_KEY);
      return savedCart ? JSON.parse(savedCart) : [];
    } catch {
      return [];
    }
  });

  // --------------------------------------------------
  // LOAD CART AFTER AUTHENTICATION
  // --------------------------------------------------

  useEffect(() => {
    if (loading) return;

    let cancelled = false;

    const loadCart = async () => {
      if (!user) {
        try {
          const savedCart = localStorage.getItem(STORAGE_KEY);
          setItems(savedCart ? JSON.parse(savedCart) : []);
        } catch {
          setItems([]);
        }

        return;
      }

      try {
        const response = await api.get<BackendCartResponse>("/cart/");

        if (cancelled) return;

        let serverItems = mapBackendCart(response.data);

        let guestItems: CartItem[] = [];

        try {
          const savedCart = localStorage.getItem(STORAGE_KEY);
          guestItems = savedCart ? JSON.parse(savedCart) : [];
        } catch {
          guestItems = [];
        }

        const failedGuestItems: CartItem[] = [];

        // Transfer guest items to the customer's database cart.
        for (const item of guestItems) {
          try {
            if (item.purchase_mode === "amount") {
              await api.post("/cart/items", {
                product_id: item.product.id,
                purchase_mode: "amount",
                amount: item.purchase_amount,
              });
            } else {
              await api.post("/cart/items", {
                product_id: item.product.id,
                purchase_mode: "quantity",
                quantity: item.quantity,
              });
            }
          } catch {
            failedGuestItems.push(item);
          }
        }

        if (cancelled) return;

        if (failedGuestItems.length > 0) {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(failedGuestItems)
          );

          alert(
            "Some guest cart items could not be transferred. They have been preserved in your browser."
          );
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }

        if (guestItems.length > 0) {
          const updatedResponse =
            await api.get<BackendCartResponse>("/cart/");

          if (cancelled) return;

          serverItems = mapBackendCart(updatedResponse.data);
        }

        setItems(serverItems);
      } catch (error) {
        if (!cancelled) {
          console.error("Could not load cart:", error);
          alert(getErrorMessage(error));
        }
      }
    };

    loadCart();

    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  // --------------------------------------------------
  // SAVE GUEST CART TO LOCAL STORAGE
  // --------------------------------------------------

  useEffect(() => {
    if (loading || user) return;

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(items)
    );
  }, [items, user, loading]);

  // --------------------------------------------------
  // CART TOTALS
  // --------------------------------------------------

  const cartCount = items.length;

  const subtotal = items.reduce((total, item) => {
    if (item.purchase_mode === "amount") {
      return total + (item.purchase_amount || 0);
    }

    return (
      total +
      getDiscountedPrice(item.product) * item.quantity
    );
  }, 0);

  // --------------------------------------------------
  // ADD TO CART
  // --------------------------------------------------

  const addToCart = async (
    product: Product,
    mode: PurchaseMode,
    value: number
  ): Promise<boolean> => {
    if (!product.is_available || product.stock <= 0) {
      alert("This product is currently out of stock.");
      return false;
    }

    if (!Number.isFinite(value) || value <= 0) {
      alert("Please enter a valid quantity or amount.");
      return false;
    }

    if (mode === "amount") {
      if (!product.allow_purchase_by_amount) {
        alert("Amount-based purchasing is not enabled for this product.");
        return false;
      }

      if (!MEASUREMENT_UNITS.includes(product.unit)) {
        alert(
          "Amount purchasing is only available for weight and volume products."
        );
        return false;
      }
    }

    if (
      mode === "quantity" &&
      DISCRETE_UNITS.includes(product.unit) &&
      !Number.isInteger(value)
    ) {
      alert(
        `${product.unit} products must have whole-number quantities.`
      );
      return false;
    }

    const quantity =
      mode === "amount"
        ? getQuantityFromAmount(product, value)
        : value;

    if (
      quantity <= 0 ||
      Math.ceil(quantity) > product.stock
    ) {
      alert(
        `Insufficient stock. Available stock: ${product.stock} ${product.unit}.`
      );
      return false;
    }

    // Logged-in customer: save to PostgreSQL.
    if (user) {
      try {
        const response = await api.post<BackendCartResponse>(
          "/cart/items",
          mode === "amount"
            ? {
                product_id: product.id,
                purchase_mode: "amount",
                amount: value,
              }
            : {
                product_id: product.id,
                purchase_mode: "quantity",
                quantity: value,
              }
        );

        setItems(mapBackendCart(response.data));
        return true;
      } catch (error) {
        alert(getErrorMessage(error));
        return false;
      }
    }

    // Guest customer: save to localStorage.
    const existingItem = items.find(
      (item) => item.product.id === product.id
    );

    if (existingItem && existingItem.purchase_mode !== mode) {
      alert(
        "This product is already in your cart using another purchase mode. Remove it first to change modes."
      );
      return false;
    }

    if (existingItem) {
      const newAmount =
        mode === "amount"
          ? (existingItem.purchase_amount || 0) + value
          : null;

      const newQuantity =
        mode === "amount"
          ? getQuantityFromAmount(product, newAmount!)
          : existingItem.quantity + value;

      if (Math.ceil(newQuantity) > product.stock) {
        alert(
          `Insufficient stock. Available stock: ${product.stock} ${product.unit}.`
        );
        return false;
      }

      const updatedItems = items.map((item) =>
        item.product.id === product.id
          ? {
              ...item,
              product,
              quantity: newQuantity,
              purchase_amount: newAmount,
            }
          : item
      );

      setItems(updatedItems);
      return true;
    }

    setItems([
      ...items,
      {
        product,
        quantity,
        purchase_mode: mode,
        purchase_amount: mode === "amount" ? value : null,
      },
    ]);

    return true;
  };

  // --------------------------------------------------
  // UPDATE CART ITEM
  // --------------------------------------------------

  const updateCartItem = async (
    productId: number,
    mode: PurchaseMode,
    value: number
  ) => {
    if (!Number.isFinite(value) || value <= 0) return;

    const existingItem = items.find(
      (item) => item.product.id === productId
    );

    if (!existingItem) return;

    const product = existingItem.product;

    if (mode === "amount") {
      if (
        !product.allow_purchase_by_amount ||
        !MEASUREMENT_UNITS.includes(product.unit)
      ) {
        alert("Amount-based purchasing is not available for this product.");
        return;
      }
    }

    if (
      mode === "quantity" &&
      DISCRETE_UNITS.includes(product.unit) &&
      !Number.isInteger(value)
    ) {
      alert(
        `${product.unit} products must have whole-number quantities.`
      );
      return;
    }

    const quantity =
      mode === "amount"
        ? getQuantityFromAmount(product, value)
        : value;

    if (
      quantity <= 0 ||
      Math.ceil(quantity) > product.stock
    ) {
      alert(
        `Insufficient stock. Available stock: ${product.stock} ${product.unit}.`
      );
      return;
    }

    // Logged-in customer: update PostgreSQL.
    if (user) {
      try {
        const response = await api.patch<BackendCartResponse>(
          `/cart/items/${productId}`,
          mode === "amount"
            ? {
                purchase_mode: "amount",
                amount: value,
              }
            : {
                purchase_mode: "quantity",
                quantity: value,
              }
        );

        setItems(mapBackendCart(response.data));
      } catch (error) {
        alert(getErrorMessage(error));
      }

      return;
    }

    // Guest customer: update local state.
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.product.id !== productId) return item;

        return {
          ...item,
          quantity,
          purchase_mode: mode,
          purchase_amount: mode === "amount" ? value : null,
        };
      })
    );
  };

  // --------------------------------------------------
  // REMOVE ONE PRODUCT
  // --------------------------------------------------

  const removeFromCart = async (productId: number) => {
    if (user) {
      try {
        const response = await api.delete<BackendCartResponse>(
          `/cart/items/${productId}`
        );

        setItems(mapBackendCart(response.data));
      } catch (error) {
        alert(getErrorMessage(error));
      }

      return;
    }

    setItems((currentItems) =>
      currentItems.filter(
        (item) => item.product.id !== productId
      )
    );
  };

  // --------------------------------------------------
  // CLEAR CART
  // --------------------------------------------------

  const clearCart = async () => {
    if (user) {
      try {
        const response = await api.delete<BackendCartResponse>(
          "/cart/"
        );

        setItems(mapBackendCart(response.data));
      } catch (error) {
        alert(getErrorMessage(error));
      }

      return;
    }

    setItems([]);
  };

  return (
    <CartContext.Provider
      value={{
        items,
        cartCount,
        subtotal,
        addToCart,
        updateCartItem,
        removeFromCart,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }

  return context;
}
