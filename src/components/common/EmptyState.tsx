import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { Illustration } from "@/components/common/Illustration";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  illustration,
}: {
  illustration?: "chat" | "calm" | "search" | "lost" | "oops";
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 p-10 text-center">
      {illustration ? (
        <Illustration kind={illustration} className="float-y h-32" />
      ) : (
        <div className="float-y grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary ring-8 ring-primary/5">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
      )}
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground text-pretty">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
