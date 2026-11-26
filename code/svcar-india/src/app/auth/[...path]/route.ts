import { NextRequest } from "next/server";

/**
 * Same-origin proxy for the API's /auth/* endpoints.
 *
 * The refresh cookie has to be first-party (Safari and Firefox drop third-party
 * cookies), so the browser talks to /auth/* on this origin — see getAuthBase()
 * in src/lib/api-config.ts. This used to be a next.config rewrite, but then the
 * API saw this host's address as the client for every customer, and its per-IP
 * OTP limit became one budget shared by the whole store. A handler can forward
 * the visitor's real IP (x-client-ip), signed with AUTH_PROXY_SECRET so the API
 * only trusts it when it comes from here.
 */
const FORWARD_REQUEST_HEADERS = ["content-type", "cookie", "authorization", "user-agent", "accept"];
const FORWARD_RESPONSE_HEADERS = ["content-type", "retry-after", "cache-control"];

function visitorIp(req: NextRequest): string | null {
  // On Vercel both headers carry the visitor's address and are set by the
  // platform, not passed through from the client.
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  const apiOrigin = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "");
  if (!apiOrigin) return Response.json({ error: "API not configured" }, { status: 503 });

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }
  const secret = process.env.AUTH_PROXY_SECRET;
  const ip = visitorIp(req);
  if (secret && ip) {
    headers.set("x-proxy-secret", secret);
    headers.set("x-client-ip", ip);
  }

  const target = `${apiOrigin}/auth/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
    redirect: "manual",
    cache: "no-store",
  });

  const out = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const v = upstream.headers.get(name);
    if (v) out.set(name, v);
  }
  for (const cookie of upstream.headers.getSetCookie()) out.append("set-cookie", cookie);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
