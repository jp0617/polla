import { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/client";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
  },
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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.phone = user.phone;
        token.favoriteTeamId = user.favoriteTeamId;
        token.isAdmin = user.isAdmin ?? false;
      }
      // Refresca isAdmin desde la DB en cada renovación del token
      if (token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { isAdmin: true },
        });
        token.isAdmin = dbUser?.isAdmin ?? false;
      }
      return token;
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.phone = token.phone;
        session.user.favoriteTeamId = token.favoriteTeamId;
        session.user.isAdmin = token.isAdmin;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          favoriteTeamId: user.favoriteTeamId ?? undefined,
          isAdmin: user.isAdmin,
        };
      },
    }),
  ],
};
