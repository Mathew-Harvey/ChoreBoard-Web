import type { CSSProperties } from 'react';

/** Bare skeleton block. Uses the `.skeleton` keyframe class from index.css. */
export function Skeleton({
  width = '100%',
  height = 16,
  radius = 12,
  className = '',
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden
    />
  );
}

/** Skeleton chore-card row. Matches the proportions of CardShell. */
export function SkeletonChoreCard() {
  return (
    <div className="card flex items-start gap-3 p-3 sm:p-4">
      <Skeleton width={36} height={36} radius={8} />
      <div className="flex-1 space-y-2">
        <Skeleton width="60%" height={12} />
        <Skeleton width="40%" height={10} />
      </div>
      <Skeleton width={48} height={14} />
    </div>
  );
}

/** Stats line: avatar + name + bar + amount. Used in dashboards. */
export function SkeletonStatRow() {
  return (
    <div className="flex items-center gap-3 py-1">
      <Skeleton width={28} height={28} radius={999} />
      <div className="flex-1 space-y-1.5">
        <Skeleton width="40%" height={10} />
        <Skeleton width="100%" height={8} />
      </div>
      <Skeleton width={48} height={12} />
    </div>
  );
}

/** Hero block (big money headline + caption) skeleton. */
export function SkeletonHero() {
  return (
    <div className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
      <div className="flex-1 space-y-3">
        <Skeleton width={120} height={10} />
        <Skeleton width="60%" height={56} radius={14} />
        <Skeleton width="40%" height={12} />
      </div>
      <Skeleton width={144} height={144} radius={20} />
    </div>
  );
}

/** Full-page block used while loading a board / dashboard. */
export function SkeletonDesktop() {
  return (
    <div className="h-full overflow-hidden p-4 sm:p-7">
      <div className="mx-auto w-full max-w-[1600px] space-y-5">
        <div className="space-y-2">
          <Skeleton width={120} height={10} />
          <Skeleton width="50%" height={36} radius={14} />
        </div>
        <SkeletonHero />
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="card space-y-3 p-5">
            <Skeleton width="35%" height={20} />
            <SkeletonStatRow />
            <SkeletonStatRow />
            <SkeletonStatRow />
          </div>
          <div className="space-y-3">
            <div className="card p-4">
              <Skeleton width="55%" height={12} />
              <Skeleton width="40%" height={24} radius={10} className="mt-2" />
            </div>
            <div className="card p-4">
              <Skeleton width="55%" height={12} />
              <Skeleton width="40%" height={24} radius={10} className="mt-2" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
