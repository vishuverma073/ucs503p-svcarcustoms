import { z } from "zod";

/** Indian mobile in E.164, e.g. +919350529717. Still used for delivery (orders
 * + addresses); auth no longer uses it. */
export const PhoneSchema = z.string().regex(/^\+91[6-9]\d{9}$/, "must be a valid +91 Indian mobile");
export type Phone = z.infer<typeof PhoneSchema>;

/** Login identity. Normalized to lowercase so uniqueness + lookups are stable. */
export const EmailSchema = z.string().trim().toLowerCase().pipe(z.string().email());
export type Email = z.infer<typeof EmailSchema>;

export const OtpSendRequestSchema = z.object({ email: EmailSchema });
export type OtpSendRequest = z.infer<typeof OtpSendRequestSchema>;

export const OtpSendResponseSchema = z.object({
  ok: z.literal(true),
  expiresInSeconds: z.number(),
});
export type OtpSendResponse = z.infer<typeof OtpSendResponseSchema>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  // Collected at checkout for delivery, not at login — so a freshly signed-up
  // user has none yet.
  phone: PhoneSchema.nullable(),
  name: z.string().nullable(),
  isAdmin: z.boolean(),
  // True once the customer has set a password (enables password login in
  // addition to OTP). Defaults false for older clients / responses.
  hasPassword: z.boolean().default(false),
});
export type User = z.infer<typeof UserSchema>;

export const OtpVerifyRequestSchema = z.object({
  email: EmailSchema,
  code: z.string().length(6).regex(/^\d+$/),
});
export type OtpVerifyRequest = z.infer<typeof OtpVerifyRequestSchema>;

/** Email + password sign-in (alternative to OTP, once a password is set). */
export const PasswordLoginRequestSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1),
});
export type PasswordLoginRequest = z.infer<typeof PasswordLoginRequestSchema>;

/** Set/change the signed-in customer's password. */
export const PasswordSetRequestSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  // Required when the account already has a password (i.e. a change, not a
  // first-time set) so a stolen access token can't silently take the account.
  currentPassword: z.string().min(1).max(128).optional(),
});
export type PasswordSetRequest = z.infer<typeof PasswordSetRequestSchema>;

// Refresh token is delivered as an httpOnly cookie, not in the body.
export const OtpVerifyResponseSchema = z.object({
  accessToken: z.string(),
  user: UserSchema,
});
export type OtpVerifyResponse = z.infer<typeof OtpVerifyResponseSchema>;
