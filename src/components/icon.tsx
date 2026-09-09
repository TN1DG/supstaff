import {
  LayoutDashboard,
  NotebookPen,
  Pill,
  MoonStar,
  Wrench,
  Users,
  ChartNoAxesColumn,
  IdCard,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  NotebookPen,
  Pill,
  MoonStar,
  Wrench,
  Users,
  ChartNoAxesColumn,
  IdCard,
  ScrollText,
};

export function Icon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Cmp = ICONS[name] ?? LayoutDashboard;
  return <Cmp className={className} aria-hidden />;
}
