export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function ComingSoon({ feature }: { feature: string }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card/50 p-10 text-center">
      <p className="text-sm font-medium">{feature} is on the way</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        This part of Supstaff is being built next. Your work here will move over
        once it&rsquo;s ready — nothing you do today will be lost.
      </p>
    </div>
  );
}
