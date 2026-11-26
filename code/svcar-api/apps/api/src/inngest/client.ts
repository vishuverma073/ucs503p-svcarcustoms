import { Inngest } from "inngest";
import { brand } from "../config/brand.js";

/**
 * Shared Inngest client (Phase 4). Event/signing keys are read from env in
 * production (INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY); the local
 * `npx inngest-cli@latest dev` server needs none.
 */
export const inngest = new Inngest({ id: brand.serviceName });
