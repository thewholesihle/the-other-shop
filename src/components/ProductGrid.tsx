import { useEffect, useRef, useState } from "react";
import ProductCard from "./ProductCard";
import type { Product } from "@/types/store";

const ProductGrid = ({ products, currency }: { products: Product[]; currency: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  const featured = products.filter((p) => p.isFeatured);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setVisible(true); }, { threshold: 0.1 });
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
        <a href="#" className="text-label hover:text-foreground transition-colors border-b border-current pb-0.5">VIEW ALL</a>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        {featured.map((p, i) => (
          <div key={p.id} className={visible ? "opacity-0 animate-fade-up" : "opacity-0"} style={{ animationDelay: `${i * 0.1}s` }}>
            <ProductCard product={p} currency={currency} />
          </div>
        ))}
      </div>
    </section>
  );
};

export default ProductGrid;
