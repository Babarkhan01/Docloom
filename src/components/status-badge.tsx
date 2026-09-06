import type { GenerationStatus } from "@/lib/schema";

const STYLES: Record<GenerationStatus, { label: string; className: string }> = {
  queued: {
    label: "Queued",
    className: "bg-amber-500/10 text-amber-400 ring-amber-500/30",
  },
  processing: {
    label: "Processing",
    className: "animate-pulse bg-amber-500/10 text-amber-400 ring-amber-500/30",
  },
  success: {
    label: "Published",
    className: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30",
  },
  failed: {
    label: "Failed",
    className: "bg-red-500/10 text-red-400 ring-red-500/30",
  },
};

export function StatusBadge({ status }: { status: GenerationStatus | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 font-mono text-xs text-zinc-500 ring-1 ring-inset ring-zinc-800">
        never generated
      </span>
    );
  }
  const style = STYLES[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-xs ring-1 ring-inset ${style.className}`}
    >
      {style.label}
    </span>
  );
}