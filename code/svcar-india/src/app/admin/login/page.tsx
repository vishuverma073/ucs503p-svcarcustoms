"use client";

import { Suspense, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi, AdminApiError } from "@/lib/admin-api";
import { safeAdminReturnTo } from "@/lib/admin-welcome";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { BRAND } from "@/lib/brand";
import { isStandaloneDisplay } from "@/lib/admin-pwa";

const noopSubscribe = () => () => {};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeAdminReturnTo(searchParams.get("returnTo"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Inside the installed phone app the box starts ticked (closing the app would
  // otherwise sign you out every time); in a browser tab it starts unticked.
  const standalone = useSyncExternalStore(noopSubscribe, () => isStandaloneDisplay(window), () => false);
  const [keepChoice, setKeepChoice] = useState<boolean | null>(null);
  const keepSignedIn = keepChoice ?? standalone;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await adminApi.login(email, password, keepSignedIn);
      const destination = encodeURIComponent(returnTo);
      router.replace(`/admin/welcome?returnTo=${destination}`);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 401) {
        setError("Invalid email or password.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-black p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            SV<span className="text-brand-orange">CAR</span>CUSTOMS
          </h1>
          <p className="text-white/40 text-sm mt-1">Admin Portal</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-2xl p-6 space-y-4 shadow-xl">
          <div>
            <label className="input-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder={`admin@${BRAND.emailDomain}`}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="input-label" htmlFor="password">
              Password
            </label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={keepSignedIn}
              onChange={(e) => setKeepChoice(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-brand-orange"
              data-testid="keep-signed-in"
            />
            <span>
              <span className="font-medium">Keep me signed in on this device</span>
              <span className="block text-xs text-text-muted">
                Stays signed in after closing the app (the session still ends after 8 hours). Don&rsquo;t tick on a
                shared computer.
              </span>
            </span>
          </label>

          {error && <p className="text-sm text-danger font-medium">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full py-3 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  // useSearchParams requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<div className="min-h-screen bg-brand-black" />}>
      <LoginForm />
    </Suspense>
  );
}
