"use client";

import { useMemo } from "react";
import { Car, CheckCircle2, AlertTriangle, Globe, HelpCircle, MessageCircle } from "lucide-react";
import type { Product } from "@svcar/contracts";
import { productFitsVehicle } from "@svcar/contracts";
import { formatFitmentTerm } from "@/lib/product-fitments";
import { useGarageStore, vehicleLabel } from "@/store/garageStore";
import { trackWhatsapp } from "@/lib/track-whatsapp";
import { fitmentWhatsAppUrl } from "@/lib/fitment-whatsapp";
import { SITE_URL } from "@/lib/site";

/**
 * Fitment panel on the PDP. Shows whether the part fits the shopper's selected
 * vehicle (from the garage store) and lists the compatible vehicles. Universal
 * parts show a "fits all vehicles" badge.
 */
export default function ProductFitment({
  product,
  variantLabel,
}: {
  product: Product;
  /** The selected variant ("Colour: Black · …"), if the product has options. */
  variantLabel?: string | null;
}) {
  const vehicle = useGarageStore((s) => s.vehicle);
  const hydrated = useGarageStore((s) => s.hydrated);

  const fits = useMemo(
    () => productFitsVehicle(product.fitsAllVehicles, product.fitments, vehicle),
    [product.fitsAllVehicles, product.fitments, vehicle],
  );

  // Only claim "universal" when the product data says so explicitly; a product
  // with no fitment rows and no flag just hasn't been mapped yet.
  const isUniversal = product.fitsAllVehicles === true;
  const hasFitments = (product.fitments ?? []).length > 0;

  const fitmentTerms = useMemo(
    () => [...new Set((product.fitments ?? []).map(formatFitmentTerm))],
    [product.fitments],
  );

  return (
    <div className="mt-6 rounded-2xl border border-border-light bg-surface-dim/40 p-4">
      <h3 className="text-[13px] font-bold uppercase tracking-wider text-text-primary mb-3 flex items-center gap-2">
        <Car size={15} className="text-brand-orange" /> Fitment
      </h3>

      {/* Verdict vs selected vehicle */}
      {hydrated && vehicle ? (
        fits ? (
          <div className="flex items-center gap-2 text-[13px] font-semibold text-success">
            <CheckCircle2 size={16} /> Fits your {vehicleLabel(vehicle)}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[13px] font-semibold text-warning">
            <AlertTriangle size={16} /> May not fit your {vehicleLabel(vehicle)}
          </div>
        )
      ) : null /* [TEMP] "Select your car" prompt removed while the header selector is hidden (Header.tsx). */}

      {/* Compatibility detail */}
      {isUniversal ? (
        <div className="mt-3 flex items-center gap-2 text-[13px] text-text-secondary">
          <Globe size={15} className="text-text-muted" /> Universal — fits most cars
        </div>
      ) : !hasFitments ? (
        <div className="mt-3 flex items-center gap-2 text-[13px] text-text-secondary">
          <HelpCircle size={15} className="text-text-muted" /> Ask us about fitment
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-wide text-text-muted mb-1.5">Compatible vehicles</p>
          <ul className="flex flex-col gap-1 text-[13px] text-text-secondary">
            {fitmentTerms.map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ul>
        </div>
      )}

      <a
        href={fitmentWhatsAppUrl({
          productName: product.name,
          variantLabel,
          url: `${SITE_URL}/product/${product.slug}`,
        })}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackWhatsapp("product", { productId: product.id, productName: product.name })}
        className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-whatsapp hover:underline"
      >
        <MessageCircle size={15} /> Not sure it fits your car? Ask on WhatsApp
      </a>
    </div>
  );
}
