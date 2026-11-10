
export interface Product {
  id: number;
  name: string;
  description: string | null;
  brand: string | null;
  category: string;
  price: string | number;
  mrp?: string | number | null;
  discount_percentage: string | number;
  discounted_price: string | number;
  unit: string;
  allow_purchase_by_amount: boolean;
  stock: number;
  image_url: string | null;
  is_available: boolean;
}
