export const ACCESS_COOKIE = "nexus_access_token";
export const REFRESH_COOKIE = "nexus_refresh_token";

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
