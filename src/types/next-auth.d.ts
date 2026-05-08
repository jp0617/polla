import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    phone?: string;
    favoriteTeamId?: string;
    isAdmin?: boolean;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      phone?: string;
      favoriteTeamId?: string;
      isAdmin?: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    phone?: string;
    favoriteTeamId?: string;
    isAdmin?: boolean;
  }
}
