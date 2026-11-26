import type { Fitment } from "@svcar/contracts";

/** Formats one vehicle compatibility record for search and customer-facing copy. */
export function formatFitmentTerm(fitment: Fitment): string {
  const years =
    fitment.yearStart != null && fitment.yearEnd != null
      ? fitment.yearStart === fitment.yearEnd
        ? ` (${fitment.yearStart})`
        : ` (${fitment.yearStart}-${fitment.yearEnd})`
      : fitment.yearStart != null
        ? ` (${fitment.yearStart} onwards)`
        : fitment.yearEnd != null
          ? ` (up to ${fitment.yearEnd})`
          : "";

  return `${fitment.make} ${fitment.model}${years}`;
}

/** Returns unique, human-readable compatibility terms in their configured order. */
export function getFitmentTerms(fitments: Fitment[] | undefined): string[] {
  return [...new Set((fitments ?? []).map(formatFitmentTerm))];
}
