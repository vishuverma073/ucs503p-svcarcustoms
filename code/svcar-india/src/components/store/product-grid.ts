/**
 * The product listing grid shared by /category/[slug], /shop, /search and their
 * skeletons, so a loading state has exactly the layout it is replaced by.
 *
 * Two columns on phones (the old single column showed ~1 product per screen),
 * three from 768 px, four from 1280 px.
 */
export const PRODUCT_GRID_CLASS = "grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 xl:grid-cols-4";

/**
 * `sizes` for a card image in {@link PRODUCT_GRID_CLASS}: half the viewport less
 * the 16 px page gutter and half the 12 px gap on phones (a 390 px phone asks
 * for ~170 px, i.e. the 384w rendition at 2x), a third up to 1279 px, and a
 * capped column beyond that (the container stops at 1520 px).
 */
export const PRODUCT_GRID_IMAGE_SIZES = "(max-width: 767px) calc(50vw - 24px), (max-width: 1279px) 33vw, 360px";
