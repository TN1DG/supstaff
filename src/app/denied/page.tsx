import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DeniedPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">That area is manager-only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&rsquo;t have access to this page. If you think you should,
          check with your manager.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">Back to today</Link>
        </Button>
      </div>
    </main>
  );
}
