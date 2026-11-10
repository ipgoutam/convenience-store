
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import api from "../../services/api";
import type { Product } from "../../types/product";

function Offers() {
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const fetchOffers = async () => {
      try {
        const response = await api.get<Product[]>(
          "/homepage/special-offers"
        );

        if (active) {
          setProducts(response.data);
        }
      } catch (err) {
        console.error("Failed to load offers:", err);

        if (active) {
          setError("Unable to load offers. Please try again.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchOffers();

    return () => {
      active = false;
    };
  }, []);

  const getDiscountedPrice = (product: Product) => {
    const discounted = Number(product.discounted_price);

    if (Number.isFinite(discounted) && discounted > 0) {
      return discounted;
    }

    return (
      Number(product.price) *
      (1 - Number(product.discount_percentage || 0) / 100)
    );
  };

  return (
    <main className="min-h-screen bg-[#F7F5EF]">
      {/* HERO */}

      <section className="relative overflow-hidden bg-[#101B2D] px-5 py-16 text-center text-white sm:py-20">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[#D6B875]/10 blur-3xl" />

        <div className="relative mx-auto max-w-3xl">
          <span className="inline-block rounded-full border border-[#D6B875]/40 bg-[#D6B875]/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-[#D6B875]">
            G-MART Special Deals
          </span>

          <h1 className="mt-5 text-4xl font-black sm:text-5xl">
            Offers & <span className="text-[#D6B875]">Deals</span>
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-gray-300 sm:text-base">
            Save more on your everyday essentials. Explore our
            latest discounted products and enjoy great deals.
          </p>
        </div>
      </section>

      {/* OFFERS */}

      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-[#101B2D]">
              Current Offers
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Special prices on selected products
            </p>
          </div>

          <Link
            to="/"
            className="text-sm font-bold text-[#8A6D25] transition hover:text-[#101B2D]"
          >
            Continue Shopping →
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="animate-pulse overflow-hidden rounded-2xl bg-white shadow-sm"
              >
                <div className="aspect-square bg-gray-200" />
                <div className="space-y-3 p-4">
                  <div className="h-4 w-3/4 rounded bg-gray-200" />
                  <div className="h-4 w-1/2 rounded bg-gray-200" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm text-red-600">{error}</p>

            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-[#101B2D] px-5 py-2 text-sm font-bold text-white"
            >
              Try Again
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-[#D6B875]/30 bg-white px-6 py-16 text-center shadow-sm">
            <div className="text-5xl">🏷️</div>

            <h3 className="mt-5 text-xl font-bold text-[#101B2D]">
              No Active Offers Right Now
            </h3>

            <p className="mt-2 text-sm text-gray-500">
              Check back soon for exciting deals and discounts.
            </p>

            <Link
              to="/"
              className="mt-6 inline-block rounded-lg bg-[#101B2D] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#1C2B42]"
            >
              Explore Products
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-5 text-sm text-gray-500">
              {products.length} discounted product
              {products.length === 1 ? "" : "s"} available
            </p>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
              {products.map((product) => {
                const originalPrice = Number(product.price);
                const discountedPrice = getDiscountedPrice(product);
                const discount = Number(product.discount_percentage || 0);

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() =>
                      navigate(`/products/${product.id}`)
                    }
                    className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white text-left shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
                  >
                    {/* PRODUCT IMAGE */}

                    <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-[#F7F5EF]">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          loading="lazy"
                          className="h-full w-full object-contain p-4 transition duration-500 group-hover:scale-110"
                        />
                      ) : (
                        <div className="text-6xl">🛍️</div>
                      )}

                      {/* DISCOUNT BADGE */}

                      <span className="absolute right-3 top-3 rounded-full bg-red-600 px-3 py-1.5 text-xs font-black text-white shadow-lg">
                        {discount}% OFF
                      </span>
                    </div>

                    {/* PRODUCT INFORMATION */}

                    <div className="p-3 sm:p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#9A7A30]">
                        {product.category}
                      </p>

                      <h3 className="mt-1 line-clamp-2 min-h-10 text-sm font-bold text-[#101B2D] sm:text-base">
                        {product.name}
                      </h3>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-base font-black text-[#101B2D]">
                          ₹{discountedPrice.toFixed(2)}
                        </span>

                        <span className="text-xs text-gray-400 line-through">
                          ₹{originalPrice.toFixed(2)}
                        </span>
                      </div>

                      <p className="mt-2 text-xs font-semibold text-emerald-600">
                        You save ₹
                        {(originalPrice - discountedPrice).toFixed(2)}
                      </p>

                      <div className="mt-4 rounded-lg bg-[#101B2D] py-2.5 text-center text-xs font-bold text-white transition group-hover:bg-[#D6B875] group-hover:text-[#101B2D]">
                        View Product →
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default Offers;
