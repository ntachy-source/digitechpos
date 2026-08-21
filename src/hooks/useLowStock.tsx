import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const KEY = "sgh_low_stock_threshold";

export const getLowStockThreshold = () => {
  const v = Number(localStorage.getItem(KEY));
  return Number.isFinite(v) && v > 0 ? v : 3;
};

export const setLowStockThreshold = (v: number) => {
  localStorage.setItem(KEY, String(Math.max(1, Math.floor(v))));
  window.dispatchEvent(new Event("sgh-low-stock-threshold"));
};

export interface LowStockItem {
  id: string;
  brand: string;
  model: string;
  category: string;
  imei_serial: string;
  quantity: number;
}

export const useLowStock = () => {
  const [threshold, setThresholdState] = useState(getLowStockThreshold());
  const [items, setItems] = useState<LowStockItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("products")
      .select("id, brand, model, category, imei_serial, quantity")
      .eq("status", "in_stock")
      .lte("quantity", threshold)
      .order("quantity", { ascending: true });
    setItems((data ?? []) as LowStockItem[]);
    setLoading(false);
  }, [threshold]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onChange = () => setThresholdState(getLowStockThreshold());
    window.addEventListener("sgh-low-stock-threshold", onChange);
    return () => window.removeEventListener("sgh-low-stock-threshold", onChange);
  }, []);

  const updateThreshold = (v: number) => {
    setLowStockThreshold(v);
    setThresholdState(Math.max(1, Math.floor(v)));
  };

  return { items, loading, threshold, updateThreshold, reload: load };
};
