import StoreShell from "@/components/store/StoreShell";
import StoreNotFound from "./(store)/not-found";

/**
 * Root 404 — unknown top-level URLs (`/wishlist`, typos, old links) previously
 * fell through to Next's bare default page with no header, footer or search.
 * Wrap the storefront's branded not-found in the store chrome instead.
 * Route-group 404s (`/product/<missing>` etc.) still render the (store) one.
 */
export default function NotFound() {
  return (
    <StoreShell>
      <StoreNotFound />
    </StoreShell>
  );
}
