import type { WhatsappLead } from "@/lib/admin-api";

/**
 * Mutable in-memory WhatsApp CTA clicks for mock mode. The admin
 * GET /admin/whatsapp-leads handler reads this and DELETE splices from it, so
 * removing a row in the admin sticks for the rest of the session.
 *
 * Timestamps are relative to load so the "today" count and the relative-time
 * labels stay sensible however long the mock has been running.
 */
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

export const whatsappLeads: WhatsappLead[] = [
  {
    id: "3f8d5a10-1c2b-4e6f-9a70-0b1c2d3e4f50",
    path: "/product/virtus-m4-spoiler-abs",
    source: "product",
    productId: 1791,
    productName: "Virtus m4 spoiler Abs",
    city: "Delhi",
    country: "India",
    createdAt: new Date(Date.now() - 12 * MIN).toISOString(),
  },
  {
    id: "4a9e6b21-2d3c-4f70-8b81-1c2d3e4f5061",
    path: "/cart",
    source: "cart",
    productId: null,
    productName: "",
    city: "Gurugram",
    country: "India",
    createdAt: new Date(Date.now() - 3 * HOUR).toISOString(),
  },
  {
    id: "5b0f7c32-3e4d-4081-9c92-2d3e4f506172",
    path: "/category/spoilers",
    source: "floating",
    productId: null,
    productName: "",
    city: "Noida",
    country: "India",
    createdAt: new Date(Date.now() - 30 * HOUR).toISOString(),
  },
];
