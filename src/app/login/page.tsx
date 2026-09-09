import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/");

  return (
    <main className="grid min-h-dvh place-items-center bg-gradient-to-b from-secondary/60 to-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <LeafMark />
          </div>
          <h1 className="text-2xl font-semibold">Welcome to Supstaff</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Sign in to start your shift.
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Trouble signing in? Ask your manager to check your account.
        </p>
      </div>
    </main>
  );
}

function LeafMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden>
      <path
        d="M20 4C10 4 4 10 4 20c8 0 16-5 16-16Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 20C7 14 11 10 17 7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
