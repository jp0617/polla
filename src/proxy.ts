import NextAuth from "next-auth";
import { edgeAuthConfig } from "@/lib/auth/config.edge";

export const { auth: proxy } = NextAuth(edgeAuthConfig);

export default proxy;

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
