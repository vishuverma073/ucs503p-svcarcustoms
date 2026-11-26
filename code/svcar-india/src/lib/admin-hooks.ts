"use client";

import useSWR, { type SWRConfiguration } from "swr";
import { adminApi, type AdminOrderItem, type ProductListParams } from "@/lib/admin-api";
import { liveSWRConfig } from "@/lib/live-refresh";
import type { AdminPhoneLeadList, AnalyticsRange } from "@svcar/contracts";

/**
 * SWR read hooks for the admin panel. Keys are arrays so different filter
 * combinations cache independently; mutations call the matching `mutate`.
 */

const noRetryOn401: SWRConfiguration = {
  shouldRetryOnError: false,
  revalidateOnFocus: false,
  // Show the data we already have while the next fetch runs. Without this every
  // tab switch or filter change blanks the list to a spinner even though the
  // request only takes ~250ms, which is what makes the panel feel slow.
  keepPreviousData: true,
  // Navigating away and back re-mounts the hook; at SWR's 2s default that is a
  // fresh round-trip every time. 30s serves the cached copy instantly and still
  // revalidates in the background, so the data stays current.
  dedupingInterval: 30_000,
};

export function useProducts(params: ProductListParams = {}) {
  const key = ["admin/products", params.q ?? "", params.status ?? "", params.flag ?? ""];
  return useSWR(key, () => adminApi.listProducts(params), noRetryOn401);
}

export function useProduct(id: number | null) {
  return useSWR(
    id ? ["admin/products", id] : null,
    () => adminApi.getProduct(id as number),
    noRetryOn401,
  );
}

export function useCategories() {
  return useSWR(["admin/categories"], () => adminApi.listCategories(), noRetryOn401);
}

export function useCategoryProducts(categoryId: number | null) {
  return useSWR(
    categoryId != null ? ["admin/products", "categoryTree", categoryId] : null,
    () => adminApi.listProductsForCategoryTree(categoryId as number),
    noRetryOn401,
  );
}

export function useHome() {
  return useSWR(["admin/home"], () => adminApi.getHome(), noRetryOn401);
}

export function useSettings() {
  return useSWR(["admin/settings"], () => adminApi.getSettings(), noRetryOn401);
}

export function useLeads() {
  return useSWR(["admin/leads"], () => adminApi.listLeads(), noRetryOn401);
}

/** Live presence — auto-refreshes every 5s so the admin sees shoppers in real time. */
export function useLive() {
  return useSWR(["admin/live"], () => adminApi.listLive(), {
    ...noRetryOn401,
    refreshInterval: 5000,
  });
}

export function useSubscribers() {
  return useSWR(["admin/subscribers"], () => adminApi.listSubscribers(), noRetryOn401);
}

/** Promo codes (newest first) with how often each was used. */
export function usePromoCodes() {
  return useSWR(["admin/promo-codes"], () => adminApi.listPromoCodes(), noRetryOn401);
}

/** WhatsApp CTA intent leads (newest first). */
export function useWhatsappLeads() {
  return useSWR(["admin/whatsapp-leads"], () => adminApi.listWhatsappLeads(), noRetryOn401);
}

/** Called with each response of a live hook (see useLiveTracker). */
type OnLiveData<T> = (data: T, key: string) => void;

/**
 * Popup phone numbers + order phones, merged per number (newest first).
 * Live: refreshes every 5s while the page is visible.
 */
export function usePhoneLeads(onData?: OnLiveData<AdminPhoneLeadList>) {
  return useSWR(["admin/phone-leads"], () => adminApi.listPhoneLeads(), {
    ...liveSWRConfig,
    onSuccess: onData,
  });
}

/** Newest orders (first page, last 7 days) for the live dashboard. */
export function useLatestOrders(onData?: OnLiveData<AdminOrderItem[]>) {
  return useSWR(
    ["admin/orders", "latest"],
    () => adminApi.listOrders(undefined, undefined, "7d").then((p) => p.items),
    { ...liveSWRConfig, onSuccess: onData },
  );
}

/** Store Analytics dashboard data for the selected range. */
export function useAnalytics(range: AnalyticsRange = "days") {
  return useSWR(["admin/analytics", range], () => adminApi.getAnalytics(range), noRetryOn401);
}

/** Order dashboard tiles + per-status counts for the selected date range (live, 5s). */
export function useOrderStats(range = "12m") {
  return useSWR(["admin/orders/stats", range], () => adminApi.getOrderStats(range), liveSWRConfig);
}
