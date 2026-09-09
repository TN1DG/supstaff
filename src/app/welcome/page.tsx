import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/rbac";
import { WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "Set your password" };

export default async function WelcomePage() {
  const me = await requireStaff();
  if (!me.mustChangePassword) redirect("/");

  const firstName = me.name.split(" ")[0] ?? me.name;

  return (
    <main className="grid min-h-dvh place-items-center bg-gradient-to-b from-secondary/60 to-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold">Welcome, {firstName}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Set a password only you know. You&rsquo;ll sign in again with it.
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <WelcomeForm />
        </div>
      </div>
    </main>
  );
}
