import type { Order } from "@/types/store";

interface Props {
  orders: Order[];
  onUpdate: (orders: Order[]) => void;
  currency: string;
}

const statusOptions: Order["status"][] = ["pending", "processing", "shipped", "delivered", "cancelled"];

const AdminOrders = ({ orders, onUpdate, currency }: Props) => {
  const handleStatusChange = (orderId: string, status: Order["status"]) => {
    onUpdate(orders.map((o) => (o.id === orderId ? { ...o, status } : o)));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold mb-1">Orders</h2>
        <p className="text-sm text-muted-foreground">{orders.length} orders total</p>
      </div>

      <div className="space-y-4">
        {orders.map((order) => (
          <div key={order.id} className="bg-card border border-border p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="font-medium tabular-nums text-foreground">{order.id}</p>
                <p className="text-sm text-muted-foreground">{order.customer} · {order.date}</p>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={order.status}
                  onChange={(e) => handleStatusChange(order.id, e.target.value as Order["status"])}
                  className="bg-transparent border border-border px-3 py-1.5 text-xs uppercase tracking-[0.1em] focus:outline-none focus:border-foreground transition-colors cursor-pointer"
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <span className="text-lg font-display font-bold tabular-nums">{currency}{order.total.toFixed(2).replace(".", ",")}</span>
              </div>
            </div>

            <div className="border-t border-border/50 pt-3 space-y-2">
              {order.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {item.quantity}× {item.name} <span className="text-xs">({item.size})</span>
                  </span>
                  <span className="tabular-nums">{currency}{(item.price * item.quantity).toFixed(2).replace(".", ",")}</span>
                </div>
              ))}
            </div>

            <div className="text-xs text-muted-foreground">
              <span className="text-label">SHIPPING:</span> {order.address}
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="text-label">EMAIL:</span> {order.email}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminOrders;
