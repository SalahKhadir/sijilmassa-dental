import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { authFailure, identitySchema, type SessionResult } from "./types";
import { backendOrigin } from "./backend-proxy";

// React.cache deduplicates within this RSC request only, never between users.
export const readServerSession = cache(async (): Promise<SessionResult> => {
  const cookie = (await cookies()).get("JSESSIONID");
  if (!cookie) return { status: "unauthenticated" };
  try {
    const response = await fetch(`${backendOrigin()}/api/v1/auth/me`, {
      headers: { Cookie: `JSESSIONID=${cookie.value}` },
      cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(8000),
    });
    if (response.status === 401) return { status: "unauthenticated" };
    if (!response.ok) return authFailure(response.status);
    const identity = identitySchema.safeParse(await response.json());
    return identity.success ? { status: "authenticated", user: identity.data } : authFailure(502);
  } catch { return authFailure(503); }
});
