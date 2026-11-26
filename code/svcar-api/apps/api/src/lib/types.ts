/** Minimal admin user record attached to the request context by requireAdmin. */
export interface AdminUserRecord {
  id: string;
  email: string | null;
  name: string | null;
  isAdmin: boolean;
  passwordChangedAt?: Date | null;
}

/** Shared Hono environment: variables set on the request context by middleware. */
export interface AppEnv {
  Variables: {
    requestId: string;
    adminUserId?: string;
    adminUser?: AdminUserRecord;
    // Customer auth (Phase 3), set by requireAuth.
    userId?: string;
    isAdmin?: boolean;
    /** Set by a route whose 5xx is an expected state (e.g. push not configured): logged at warn. */
    expectedFailure?: boolean;
  };
}
