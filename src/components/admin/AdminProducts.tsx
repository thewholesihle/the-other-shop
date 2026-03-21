import { useState } from "react";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";
import type { Product } from "@/types/store";

interface Props {
  products: Product[];
  onUpdate: (products: Product[]) => void;
  currency: string;
}

const emptyProduct: Product = {
  id: "",
  name: "",
  category: "",
  price: 0,
  image: "/images/product-1.jpg",
  description: "",
  sizes: ["S", "M", "L", "XL"],
  colors: [],
  stock: 0,
  isNew: false,
  isFeatured: false,
};

const AdminProducts = ({ products, onUpdate, currency }: Props) => {
  const [editing, setEditing] = useState<Product | null>(null);
  const [isNew, setIsNew] = useState(false);

  const handleSave = () => {
    if (!editing) return;
    if (isNew) {
      const newProd = { ...editing, id: `prod-${Date.now()}` };
      onUpdate([...products, newProd]);
    } else {
      onUpdate(products.map((p) => (p.id === editing.id ? editing : p)));
    }
    setEditing(null);
    setIsNew(false);
  };

  const handleDelete = (id: string) => {
    onUpdate(products.filter((p) => p.id !== id));
  };

  const handleAdd = () => {
    setEditing({ ...emptyProduct });
    setIsNew(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold mb-1">Products</h2>
          <p className="text-sm text-muted-foreground">{products.length} products total</p>
        </div>
        <button onClick={handleAdd} className="flex items-center gap-2 bg-foreground text-primary-foreground px-4 py-2.5 text-label tracking-[0.15em] hover:bg-foreground/90 transition-colors active:scale-[0.97]">
          <Plus size={16} /> ADD PRODUCT
        </button>
      </div>

      {/* Product List */}
      <div className="bg-card border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-label p-3">PRODUCT</th>
              <th className="text-left text-label p-3 hidden md:table-cell">CATEGORY</th>
              <th className="text-right text-label p-3">PRICE</th>
              <th className="text-right text-label p-3">STOCK</th>
              <th className="text-center text-label p-3">STATUS</th>
              <th className="text-right text-label p-3">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <img src={p.image} alt={p.name} className="w-10 h-10 object-cover bg-secondary flex-shrink-0" />
                    <span className="font-medium">{p.name}</span>
                  </div>
                </td>
                <td className="p-3 text-muted-foreground capitalize hidden md:table-cell">{p.category}</td>
                <td className="p-3 text-right tabular-nums">{currency}{p.price.toFixed(2).replace(".", ",")}</td>
                <td className="p-3 text-right tabular-nums">{p.stock}</td>
                <td className="p-3 text-center">
                  <span className={`inline-block text-[10px] tracking-[0.15em] uppercase px-2 py-0.5 font-medium ${
                    p.stock === 0 ? "bg-destructive/15 text-destructive" :
                    p.isNew ? "bg-store-olive/15 text-store-olive" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {p.stock === 0 ? "Out of stock" : p.isNew ? "New" : "Active"}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => { setEditing({ ...p }); setIsNew(false); }} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors active:scale-90">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors active:scale-90">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4">
          <div className="bg-background border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-5 animate-fade-up">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-display font-bold">{isNew ? "Add Product" : "Edit Product"}</h3>
              <button onClick={() => { setEditing(null); setIsNew(false); }} className="text-muted-foreground hover:text-foreground active:scale-90">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-label block mb-1.5">NAME</label>
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-label block mb-1.5">CATEGORY</label>
                  <input value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
                </div>
                <div>
                  <label className="text-label block mb-1.5">PRICE ({currency})</label>
                  <input type="number" value={editing.price} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} className="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors tabular-nums" />
                </div>
              </div>
              <div>
                <label className="text-label block mb-1.5">DESCRIPTION</label>
                <textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={3} className="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors resize-none" />
              </div>
              <div>
                <label className="text-label block mb-1.5">IMAGE PATH</label>
                <input value={editing.image} onChange={(e) => setEditing({ ...editing, image: e.target.value })} className="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-label block mb-1.5">STOCK</label>
                  <input type="number" value={editing.stock} onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })} className="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors tabular-nums" />
                </div>
                <div>
                  <label className="text-label block mb-1.5">SIZES (comma sep.)</label>
                  <input value={editing.sizes.join(", ")} onChange={(e) => setEditing({ ...editing, sizes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} className="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
                </div>
              </div>
              <div>
                <label className="text-label block mb-1.5">COLORS (comma sep.)</label>
                <input value={editing.colors.join(", ")} onChange={(e) => setEditing({ ...editing, colors: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} className="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={editing.isNew} onChange={(e) => setEditing({ ...editing, isNew: e.target.checked })} className="accent-foreground" />
                  Mark as New
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={editing.isFeatured} onChange={(e) => setEditing({ ...editing, isFeatured: e.target.checked })} className="accent-foreground" />
                  Featured
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={handleSave} className="flex items-center gap-2 bg-foreground text-primary-foreground px-5 py-2.5 text-label tracking-[0.15em] hover:bg-foreground/90 transition-colors active:scale-[0.97]">
                <Check size={16} /> SAVE
              </button>
              <button onClick={() => { setEditing(null); setIsNew(false); }} className="px-5 py-2.5 text-label tracking-[0.15em] border border-border hover:bg-muted transition-colors active:scale-[0.97]">
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminProducts;
