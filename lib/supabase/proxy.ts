import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";

/** Preserve refreshed auth cookies when returning a redirect response. */
function redirectWithCookies(url: URL, supabaseResponse: NextResponse) {
  const redirectResponse = NextResponse.redirect(url);
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });
  supabaseResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "location") {
      redirectResponse.headers.set(key, value);
    }
  });
  return redirectResponse;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // If the env vars are not set, skip proxy check. You can remove this
  // once you setup the project.
  if (!hasEnvVars) {
    return supabaseResponse;
  }

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;
  const userId = typeof user?.sub === "string" ? user.sub : null;
  let isActiveUser = !!user;

  if (userId) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", userId)
      .maybeSingle();
    // Only trust a *successful* query. A transient error (e.g. brief token
    // refresh race) must NOT flip this, or a valid session gets bounced to
    // /auth/login on every single request. Also: never call auth.signOut()
    // here — doing so previously turned a transient false-positive into a
    // permanent, self-perpetuating redirect loop instead of self-recovering
    // on the next request.
    if (!profileError && (!profile || !profile.is_active)) {
      isActiveUser = false;
    }
  }

  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith("/auth");

  // Meta webhook delivery and the isolated website widget must be publicly reachable.
  if (
    pathname.startsWith("/api/webhook") ||
    pathname.startsWith("/api/public/widget") ||
    pathname === "/widget" ||
    pathname === "/widget.js"
  ) {
    return supabaseResponse;
  }

  // Always land on leads after auth — /dashboard is super-admin only and was
  // the center of a redirect loop when profile lookup failed in RSC.
  const postLoginPath = "/dashboard/leads";

  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = isActiveUser ? postLoginPath : "/auth/login";
    return redirectWithCookies(url, supabaseResponse);
  }

  if (!isActiveUser && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return redirectWithCookies(url, supabaseResponse);
  }

  if (
    isActiveUser &&
    isAuthRoute &&
    !pathname.startsWith("/auth/confirm") &&
    !pathname.startsWith("/auth/sign-up-success") &&
    !pathname.startsWith("/auth/update-password")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = postLoginPath;
    return redirectWithCookies(url, supabaseResponse);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
