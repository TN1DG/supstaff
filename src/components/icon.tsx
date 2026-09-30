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
  ClipboardList,
  Building2,
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
  ClipboardList,
  Building2,
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
