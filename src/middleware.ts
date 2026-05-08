import NextAuth from "next-auth";
import { edgeAuthConfig } from "@/lib/auth/config.edge";

export const { auth: middleware } = NextAuth(edgeAuthConfig);

export default middleware;

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
