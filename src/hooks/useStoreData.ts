import { useState, useEffect, useCallback } from "react";
import type { StoreData, Product, Order } from "@/types/store";

const STORAGE_KEY = "others-store-data";

async function loadBaseData(): Promise<StoreData> {
  const res = await fetch("/data/store.json");
  return res.json();
}

function getStoredOverrides(): Partial<StoreData> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveOverrides(data: Partial<StoreData>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function useStoreData() {
  const [data, setData] = useState<StoreData | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const base = await loadBaseData();
    const overrides = getStoredOverrides();
    const merged: StoreData = {
      site: overrides?.site ?? base.site,
      categories: overrides?.categories ?? base.categories,
      products: overrides?.products ?? base.products,
      orders: overrides?.orders ?? base.orders,
    };
    setData(merged);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const updateProducts = useCallback((products: Product[]) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = { ...prev, products };
      saveOverrides(next);
      return next;
    });
  }, []);

  const updateOrders = useCallback((orders: Order[]) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = { ...prev, orders };
      saveOverrides(next);
      return next;
    });
  }, []);

  const updateSite = useCallback((site: StoreData["site"]) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = { ...prev, site };
      saveOverrides(next);
      return next;
    });
  }, []);

  const resetData = useCallback(async () => {
    localStorage.removeItem(STORAGE_KEY);
    await reload();
  }, [reload]);

  return { data, loading, updateProducts, updateOrders, updateSite, resetData };
}
