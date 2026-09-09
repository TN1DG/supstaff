import NextAuth, { type DefaultSession } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { staff } from "@/db/schema";
import type { StaffRole } from "@/db/schema";
import { hashSecret, verifySecret } from "@/lib/password";
import { rateLimitHit, rateLimitClear, rateLimitStatus } from "@/lib/rate-limit";

// Brute-force + argon2-DoS guard: a few tries per email per window, then a
// lockout. Checked before we spend CPU on a hash.
const LOGIN_LIMIT = { limit: 8, windowSec: 15 * 60, lockoutSec: 15 * 60 };

// Burned when the email is unknown so a failed login costs the same whether or
// not the account exists (defeats user enumeration by response time).
const DUMMY_PASSWORD = "not-a-real-password-000";

const IDLE_TIMEOUT_SECONDS = 45 * 60; // sign out after 45 min of inactivity
const ABSOLUTE_TIMEOUT_SECONDS = 12 * 60 * 60; // and after 12h regardless

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: StaffRole;
      siteId: string;
      isAdmin: boolean;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    staffId: string;
    role: StaffRole;
    siteId: string;
    isAdmin: boolean;
    mustChangePassword: boolean;
    loginAt: number;
    lastSeen: number;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: IDLE_TIMEOUT_SECONDS,
    updateAge: 5 * 60,
  },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase().trim();
        const { password } = parsed.data;
        const limitKey = `login:${email}`;

        // Locked out — reject without touching the DB or a hash.
        if (!(await rateLimitStatus(limitKey)).ok) return null;

        const db = getDb();
        const person = await db.query.staff.findFirst({
          where: eq(staff.email, email),
        });

        const engagementEnded =
          !!person?.engagedUntil &&
          new Date(person.engagedUntil) < new Date(new Date().toDateString());

        // Always run one argon2 op so timing doesn't reveal whether the
        // account exists or is active.
        const ok =
          person && person.active && !engagementEnded
            ? await verifySecret(person.passwordHash, password)
            : (await hashSecret(DUMMY_PASSWORD), false);

        if (!ok || !person) {
          await rateLimitHit(limitKey, LOGIN_LIMIT);
          return null;
        }

        await rateLimitClear(limitKey);
        await db
          .update(staff)
          .set({ lastLoginAt: new Date() })
          .where(eq(staff.id, person.id));

        return {
          id: person.id,
          email: person.email,
          name: person.name,
          role: person.role,
          siteId: person.siteId,
          isAdmin: person.isAdmin,
          mustChangePassword: person.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user, trigger, session }) => {
      const now = Math.floor(Date.now() / 1000);

      if (user) {
        const u = user as unknown as {
          id: string;
          role: StaffRole;
          siteId: string;
          isAdmin: boolean;
          mustChangePassword: boolean;
        };
        token.staffId = u.id;
        token.role = u.role;
        token.siteId = u.siteId;
        token.isAdmin = u.isAdmin;
        token.mustChangePassword = u.mustChangePassword;
        token.loginAt = now;
        token.lastSeen = now;
        return token;
      }

      // Client called update() e.g. after changing password.
      if (
        trigger === "update" &&
        session &&
        (session as { mustChangePassword?: boolean }).mustChangePassword === false
      ) {
        token.mustChangePassword = false;
      }

      const lastSeen = token.lastSeen ?? now;
      const loginAt = token.loginAt ?? now;
      if (
        now - lastSeen > IDLE_TIMEOUT_SECONDS ||
        now - loginAt > ABSOLUTE_TIMEOUT_SECONDS
      ) {
        return null as unknown as JWT;
      }
      token.lastSeen = now;
      return token;
    },
    session: ({ session, token }) => {
      if (token && session.user) {
        session.user.id = token.staffId;
        session.user.role = token.role;
        session.user.siteId = token.siteId;
        session.user.isAdmin = token.isAdmin;
        session.user.mustChangePassword = token.mustChangePassword;
      }
      return session;
    },
  },
});
