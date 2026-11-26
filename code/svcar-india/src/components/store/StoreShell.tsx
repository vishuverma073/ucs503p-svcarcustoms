import { Toaster } from "sonner";
import StoreHeader from "@/components/store/Header";
import StoreFooter from "@/components/store/Footer";
import WhatsAppButton from "@/components/store/WhatsAppButton";
import LeadPopup from "@/components/store/LeadPopup";
import AnalyticsTracker from "@/components/store/AnalyticsTracker";
import AuthProvider from "@/components/auth/AuthProvider";
import ShopByCarChips from "@/components/store/ShopByCarChips";
import MobileTabBar from "@/components/store/carbon/MobileTabBar";
import HideOnCheckout from "@/components/store/carbon/HideOnCheckout";

/**
 * Storefront chrome: header, main, footer, WhatsApp FAB, analytics and the one
 * sonner <Toaster> for customer-facing messages (admin mounts its own). Used by
 * the (store) layout and by the root not-found page, so unknown top-level URLs
 * get the same shop around the 404 instead of Next's bare default.
 *
 * `div.store` scopes storefront-only CSS (e.g. the :focus-visible ring in
 * globals.css) so the admin panel keeps its own styling.
 */
export default function StoreShell({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <div className="store">
                <StoreHeader />
                {/* Design D "By car" chip row under the header (on home it sits below the hero). */}
                <HideOnCheckout alsoHideOnHome>
                    <ShopByCarChips variant="bar" />
                </HideOnCheckout>
                <main className="min-h-screen">{children}</main>
                <StoreFooter />
                <WhatsAppButton />
                {/* 30s "Need help finding the right part?" phone ask — browsing pages only. */}
                <LeadPopup />
                {/* Phone-only Home / Shop / Search / Cart / WhatsApp (hidden on checkout). */}
                <MobileTabBar />
            </div>
            {/* offset clears the sticky header (66px) so toasts never sit under it;
                sonner uses mobileOffset instead of offset below 600px. */}
            <Toaster position="top-center" offset={72} mobileOffset={72} />
            <AnalyticsTracker />
        </AuthProvider>
    );
}
