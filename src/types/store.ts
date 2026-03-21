export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  description: string;
  sizes: string[];
  colors: string[];
  stock: number;
  isNew: boolean;
  isFeatured: boolean;
}

export interface OrderItem {
  productId: string;
  name: string;
  size: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  customer: string;
  email: string;
  items: OrderItem[];
  total: number;
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled";
  date: string;
  address: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface HeroContent {
  label: string;
  heading: string;
  cta: string;
  image: string;
}

export interface SiteConfig {
  name: string;
  tagline: string;
  description: string;
  announcement: string;
  currency: string;
  hero: HeroContent;
  socials: Record<string, string>;
}

export interface StoreData {
  site: SiteConfig;
  categories: Category[];
  products: Product[];
  orders: Order[];
}
