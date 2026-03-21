import { Package, ShoppingCart, DollarSign, TrendingUp } from "lucide-react";
import type { StoreData } from "@/types/store";

const StatCard = ({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) => (
  <div className="bg-card border border-border p-5 hover:shadow-md transition-shadow duration-200">
    <div className="flex items-start justify-between mb-3">
      <span className="text-label">{label}</span>
      <Icon size={18} className="text-muted-foreground" strokeWidth={1.5} />
    </div>
    <p className="text-2xl font-display font-bold text-foreground tabular-nums">{value}</p>
    {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
  </div>
);

const AdminDashboard = ({ data }: { data: StoreData }) => {
  const totalRevenue = data.orders.reduce((sum, o) => sum + o.total, 0);
  const totalProducts = data.products.length;
  const totalOrders = data.orders.length;
  const lowStock = data.products.filter((p) => p.stock > 0 && p.stock <= 10).length;
  const outOfStock = data.products.filter((p) => p.stock === 0).length;
  const pendingOrders = data.orders.filter((o) => o.status === "pending").length;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-display font-bold mb-1">Dashboard</h2>
        <p className="text-sm text-muted-foreground">Overview of your store performance.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={DollarSign} label="REVENUE" value={`€${totalRevenue.toFixed(2).replace(".", ",")}`} sub="All time" />
        <StatCard icon={ShoppingCart} label="ORDERS" value={String(totalOrders)} sub={`${pendingOrders} pending`} />
        <StatCard icon={Package} label="PRODUCTS" value={String(totalProducts)} sub={`${outOfStock} out of stock`} />
        <StatCard icon={TrendingUp} label="LOW STOCK" value={String(lowStock)} sub="Items below 10 units" />
      </div>

      {/* Recent Orders */}
      <div>
        <h3 className="text-lg font-display font-bold mb-4">Recent Orders</h3>
        <div className="bg-card border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-label p-3">ORDER</th>
                <th className="text-left text-label p-3">CUSTOMER</th>
                <th className="text-left text-label p-3">STATUS</th>
                <th className="text-right text-label p-3">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.slice(0, 5).map((order) => (
                <tr key={order.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                  <td className="p-3 font-medium tabular-nums">{order.id}</td>
                  <td className="p-3 text-muted-foreground">{order.customer}</td>
                  <td className="p-3">
                    <span className={`inline-block text-[10px] tracking-[0.15em] uppercase px-2 py-0.5 font-medium ${
                      order.status === "shipped" ? "bg-store-olive/15 text-store-olive" :
                      order.status === "processing" ? "bg-store-sand/40 text-store-charcoal" :
                      order.status === "delivered" ? "bg-store-olive/25 text-store-olive" :
                      order.status === "cancelled" ? "bg-destructive/15 text-destructive" :
                      "bg-store-rust/15 text-store-rust"
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="p-3 text-right tabular-nums">€{order.total.toFixed(2).replace(".", ",")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Low Stock Alert */}
      {(lowStock > 0 || outOfStock > 0) && (
        <div>
          <h3 className="text-lg font-display font-bold mb-4">Stock Alerts</h3>
          <div className="space-y-2">
            {data.products.filter((p) => p.stock <= 10).map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-card border border-border p-3">
                <div className="flex items-center gap-3">
                  <img src={p.image} alt={p.name} className="w-10 h-10 object-cover bg-secondary" />
                  <span className="text-sm font-medium">{p.name}</span>
                </div>
                <span className={`text-sm tabular-nums font-medium ${p.stock === 0 ? "text-destructive" : "text-store-rust"}`}>
                  {p.stock === 0 ? "Out of stock" : `${p.stock} left`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
