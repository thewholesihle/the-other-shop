import { useEffect, useRef, useState } from "react";
import ProductCard from "./ProductCard";
import product1 from "@/assets/product-1.jpg";
import product2 from "@/assets/product-2.jpg";
import product3 from "@/assets/product-3.jpg";
import product4 from "@/assets/product-4.jpg";
import product5 from "@/assets/product-5.jpg";
import product6 from "@/assets/product-6.jpg";

const products = [
  { image: product1, name: "Olive Heavy Hoodie", category: "Others.", price: "€120,00", isNew: true },
  { image: product2, name: "Sand Essential Tee", category: "Others.", price: "€55,00", isNew: true },
  { image: product3, name: "Black Utility Cargo", category: "Others.", price: "€145,00", isNew: false },
  { image: product4, name: "Rust Bomber Jacket", category: "Others.", price: "€195,00", isNew: true },
  { image: product5, name: "Cream Logo Crewneck", category: "Others.", price: "€95,00", isNew: false },
  { image: product6, name: "Charcoal Jogger Pants", category: "Others.", price: "€110,00", isNew: false },
];

const ProductGrid = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="products" ref={ref} className="px-6 md:px-10 py-20 md:py-32">
      <div className="flex items-end justify-between mb-12">
        <div>
          <p className="text-label mb-2">Latest</p>
          <h2 className="text-3xl md:text-4xl font-display font-bold leading-tight">New Drops</h2>
        </div>
        <a href="#" className="text-label hover:text-foreground transition-colors border-b border-current pb-0.5">
          VIEW ALL
        </a>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        {products.map((p, i) => (
          <div
            key={p.name}
            className={visible ? "opacity-0 animate-fade-up" : "opacity-0"}
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <ProductCard {...p} />
          </div>
        ))}
      </div>
    </section>
  );
};

export default ProductGrid;
