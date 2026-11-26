/**
 * Mock-mode phone leads: numbers from the storefront popup, plus a couple of
 * seeded orders so Admin → Phone leads has both sources to show. All numbers and
 * names here are made up.
 *
 * Popup numbers posted in the browser are also kept in localStorage, so a lead
 * sent on the storefront is still listed after a full page load into /admin
 * (the MSW worker's memory resets on every load).
 */
const HOUR = 60 * 60 * 1000;
const STORE_KEY = "svcar-mock-phone-leads";

export interface MockPhoneLead {
  phone: string;
  pagePath: string | null;
  createdAt: string;
}

export interface MockLeadOrder {
  id: string;
  orderNumber: string;
  name: string;
  phone: string;
  status: string;
  paymentStatus: string;
  total: number;
  createdAt: string;
}

const seededPopup: MockPhoneLead[] = [
  { phone: "9810000001", pagePath: "/product/virtus-m4-spoiler-abs", createdAt: new Date(Date.now() - 2 * HOUR).toISOString() },
  { phone: "9810000002", pagePath: "/", createdAt: new Date(Date.now() - 26 * HOUR).toISOString() },
];

/** Orders that exist only for this page's mock (real mock checkouts are added too). */
export const seededLeadOrders: MockLeadOrder[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    orderNumber: "SVMOCK0001",
    name: "Mock Buyer (popup + order)",
    phone: "+91 98100 00002",
    status: "pending",
    paymentStatus: "pending",
    total: 4299,
    createdAt: new Date(Date.now() - 20 * HOUR).toISOString(),
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    orderNumber: "SVMOCK0002",
    name: "Mock Buyer (order only)",
    phone: "9810000003",
    status: "paid",
    paymentStatus: "paid",
    total: 12198,
    createdAt: new Date(Date.now() - 72 * HOUR).toISOString(),
  },
];

function readStored(): MockPhoneLead[] {
  try {
    if (typeof window === "undefined") return [];
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORE_KEY) || "[]");
    return Array.isArray(parsed) ? (parsed as MockPhoneLead[]) : [];
  } catch {
    return [];
  }
}

export function listMockPhoneLeads(): MockPhoneLead[] {
  return [...seededPopup, ...readStored()];
}

export function addMockPhoneLead(lead: MockPhoneLead): void {
  try {
    if (typeof window === "undefined") {
      seededPopup.push(lead);
      return;
    }
    window.localStorage.setItem(STORE_KEY, JSON.stringify([...readStored(), lead]));
  } catch {
    seededPopup.push(lead);
  }
}
