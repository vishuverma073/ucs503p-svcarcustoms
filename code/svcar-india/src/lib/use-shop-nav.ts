"use client";

import useSWR from "swr";
import { backend } from "@/lib/backend";
import { SHOP_HREF, resolveFeaturedCategories } from "@/lib/shop-nav";

export function useShopNav() {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    "shop-nav",
    () => backend.getShopNav(),
    {
      revalidateOnFocus: true,
      dedupingInterval: 15_000,
      shouldRetryOnError: true,
      errorRetryCount: 2,
    },
  );

  const tree = data?.tree ?? [];
  const featured = resolveFeaturedCategories(tree, data?.featuredIds ?? []);
  const browseHref = SHOP_HREF;
  const hasCategories = tree.length > 0;
  const isInitialLoading = isLoading && !data;
  const isError = Boolean(error) && !hasCategories;

  return {
    tree,
    featured,
    browseHref,
    hasCategories,
    flatCount: data?.flatCount ?? 0,
    usedFallback: data?.usedFallback ?? false,
    fetchWarning: data?.fetchWarning,
    isLoading: isInitialLoading,
    isValidating,
    isError,
    isEmpty: !isInitialLoading && !isError && !hasCategories,
    refresh: mutate,
  };
}
