import type { ReadinessIssue, Track } from '@travel-route-animator/core';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { de } from '@/i18n/de';
import { translateIssue } from '@/i18n/issues';
import type { SelectOption } from './fields/SelectField';

/** A titled block of fields, separated from the previous one by a line. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2.5 border-t pt-3">
      <h3 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Two narrow fields side by side, e.g. start and duration. */
export function Row({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

/** What a later module adds here, so a missing setting does not look forgotten. */
export function LaterNote({ text }: { text: string }) {
  return <p className="text-muted-foreground border-t pt-3 text-xs">{text}</p>;
}

/** The kind of item and its name, at the top of every form. */
export function FormHeading({ kind, name }: { kind: string; name: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{kind}</p>
      <h2 className="truncate text-base font-semibold">{name || de.tree.unnamed}</h2>
    </div>
  );
}

/** Whether the stage can be rendered, and if not, what is missing (ADR 0002). */
export function ReadinessNote({
  issues,
  describe = translateIssue,
}: {
  issues: readonly ReadinessIssue[];
  describe?: (issue: ReadinessIssue) => string;
}) {
  if (issues.length === 0) {
    return (
      <p className="text-muted-foreground flex items-center gap-2">
        <CircleCheck className="size-4 text-emerald-500" /> {de.inspector.ready}
      </p>
    );
  }
  return (
    <div role="note" className="border-warning/40 bg-warning/10 rounded-md border p-2">
      <p className="text-warning flex items-center gap-2 font-medium">
        <TriangleAlert className="size-4" /> {de.tree.notReady}
      </p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {issues.map((issue) => (
          <li key={issue.path + issue.code}>{describe(issue)}</li>
        ))}
      </ul>
    </div>
  );
}

/** Select options from a fixed list of values and their German labels. */
export function optionsOf<T extends string>(
  values: readonly T[],
  labels: Record<T, string>,
  disabled: (value: T) => boolean = () => false,
): SelectOption<T>[] {
  return values.map((value) => ({ value, label: labels[value], disabled: disabled(value) }));
}

/** The name a track shows everywhere: its label, or else its vehicle. */
export function trackName(track: Track): string {
  return track.label ?? de.vehicles[track.vehicle.type];
}
