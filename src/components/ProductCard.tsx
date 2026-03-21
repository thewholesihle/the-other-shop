import { useState } from "react";
import { Heart } from "lucide-react";
import type { Product } from "@/types/store";

const ProductCard = ({ product, currency }: { product: Product; currency: string }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [liked, setLiked] = useState(false);

  return (
    <div className="group cursor-pointer" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <div className="relative aspect-[3/4] overflow-hidden bg-secondary mb-3">
        <img src={product.image} alt={product.name} className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105" loading="lazy" />
        {product.isNew && (
          <span className="absolute top-3 left-3 bg-foreground text-primary-foreground text-[10px] tracking-[0.2em] uppercase px-3 py-1 font-medium">New</span>
        )}
        {product.stock === 0 && (
          <span className="absolute top-3 left-3 bg-store-rust text-accent-foreground text-[10px] tracking-[0.2em] uppercase px-3 py-1 font-medium">Sold Out</span>
        )}
        <button onClick={(e) => { e.stopPropagation(); setLiked(!liked); }} className={`absolute top-3 right-3 p-2 transition-all duration-200 active:scale-90 ${isHovered || liked ? "opacity-100" : "opacity-0"}`}>
          <Heart size={18} strokeWidth={1.5} className={liked ? "fill-store-rust text-store-rust" : "text-foreground"} />
        </button>
        <div className={`absolute bottom-0 left-0 right-0 bg-foreground/90 text-primary-foreground text-center py-3 text-label tracking-[0.2em] transition-all duration-300 ${isHovered ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"}`}>
          QUICK VIEW
        </div>
      </div>
      <p className="text-label text-muted-foreground mb-1">Others.</p>
      <p className="text-sm font-medium text-foreground mb-1 overflow-wrap-break-word">{product.name}</p>
      <p className="text-sm text-foreground tabular-nums">{currency}{product.price.toFixed(2).replace(".", ",")}</p>
    </div>
  );
};

export default ProductCard;
