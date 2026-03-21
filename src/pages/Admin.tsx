import { Routes, Route } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminDashboard from "@/components/admin/AdminDashboard";
import AdminProducts from "@/components/admin/AdminProducts";
import AdminOrders from "@/components/admin/AdminOrders";
import AdminSettings from "@/components/admin/AdminSettings";
import { useStoreData } from "@/hooks/useStoreData";

const Admin = () => {
  const { data, loading, updateProducts, updateOrders, updateSite, resetData } = useStoreData();

  if (loading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AdminLayout>
      <Routes>
        <Route index element={<AdminDashboard data={data} />} />
        <Route path="products" element={<AdminProducts products={data.products} onUpdate={updateProducts} currency={data.site.currency} />} />
        <Route path="orders" element={<AdminOrders orders={data.orders} onUpdate={updateOrders} currency={data.site.currency} />} />
        <Route path="settings" element={<AdminSettings site={data.site} onUpdate={updateSite} onReset={resetData} />} />
      </Routes>
    </AdminLayout>
  );
};

export default Admin;
