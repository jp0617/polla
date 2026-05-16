import type { NextAuthConfig } from "next-auth";

// Edge-compatible config: no Node.js modules, no bcrypt, no database calls.
// Used only by middleware for JWT verification.
export const edgeAuthConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublicPath = ["/login", "/register"].some((p) =>
        nextUrl.pathname.startsWith(p)
      );
      if (isPublicPath) return true;
      if (!isLoggedIn) return Response.redirect(new URL("/login", nextUrl));
      return true;
    },
  },
  providers: [], // no providers needed for JWT verification in middleware
};
