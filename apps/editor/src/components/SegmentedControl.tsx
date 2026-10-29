import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  hint: string;
}

/** A row of buttons of which one is active, e.g. Bearbeiten | Vorschau. */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('flex rounded-md border', className)}>
      {options.map((option) => (
        <Tooltip key={option.value}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-pressed={option.value === value}
              className={cn(
                'flex items-center gap-1.5 px-2 py-0.5 first:rounded-l-md last:rounded-r-md [&_svg]:size-3.5',
                option.value === value ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          </TooltipTrigger>
          <TooltipContent>{option.hint}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
