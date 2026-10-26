import {
  editWaypoint,
  moveWaypoint,
  removeWaypoint,
  setWaypointKind,
  type Id,
  type Waypoint,
} from '@travel-route-animator/core';
import { useDraggable } from '@dnd-kit/react';
import { GripVertical, MoreHorizontal } from 'lucide-react';
import { useRef } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { de } from '@/i18n/de';
import { cn } from '@/lib/utils';
import { NumberField } from '../fields/NumberField';
import { SwitchField } from '../fields/SwitchField';
import { TextField } from '../fields/TextField';
import type { Edit } from '../useEdit';

export interface WaypointRowProps {
  trackId: Id;
  waypoint: Waypoint;
  index: number;
  count: number;
  /** The track's line colour, so the list reads like the map. */
  color: string;
  edit: Edit;
  dropIndicator: 'before' | 'after' | null;
  /** Highlighted together with its marker on the map. */
  selected: boolean;
  onSelect: () => void;
  onShowOnMap: () => void;
  onEditCoordinates: () => void;
}

export function WaypointRow({
  trackId,
  waypoint,
  index,
  count,
  color,
  edit,
  dropIndicator,
  selected,
  onSelect,
  onShowOnMap,
  onEditCoordinates,
}: WaypointRowProps) {
  const number = index + 1;
  const isStop = waypoint.kind === 'stop';
  // A stop at either end must stay one (ADR 0002 reports it otherwise); a shape point that
  // ended up there after reordering can still be turned into a stop.
  const kindLocked = isStop && (index === 0 || index === count - 1);
  const afterClose = useRef<(() => void) | null>(null);

  // Only the grip starts a drag, so the name field and the menu keep working as usual.
  const { ref, handleRef, isDragging } = useDraggable({ id: waypoint.id, type: 'waypoint' });

  const path = (field: string) => `waypoints[${index}].${field}`;
  const change = (field: string, update: (w: Waypoint) => Waypoint, coalesce = false) =>
    edit(path(field), (p) => editWaypoint(p, trackId, waypoint.id, update), { coalesce });
  const move = (toIndex: number) =>
    edit('waypoints', (p) => moveWaypoint(p, trackId, waypoint.id, toIndex));

  return (
    <li
      ref={ref}
      data-waypoint-id={waypoint.id}
      aria-label={`${de.waypoints.number(number)}: ${waypoint.name || de.waypoints.unnamedShape}`}
      // Working in a row (its name, its hold) selects the point, as clicking its marker does.
      onFocus={onSelect}
      className={cn(
        'rounded-md py-1.5',
        selected && 'bg-primary/10 ring-primary/50 ring-1',
        isDragging && 'opacity-60',
        // Insertion line above or below, as in the project tree.
        dropIndicator === 'before' && 'shadow-[inset_0_2px_0_var(--primary)]',
        dropIndicator === 'after' && 'shadow-[inset_0_-2px_0_var(--primary)]',
      )}
    >
      <div className="flex items-center gap-1.5">
        <button
          ref={handleRef}
          type="button"
          aria-label={de.waypoints.drag}
          title={de.waypoints.drag}
          className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab"
        >
          <GripVertical className="size-4" />
        </button>
        <button
          type="button"
          disabled={kindLocked}
          aria-label={`${de.waypoints.number(number)}: ${de.waypoints.kinds[waypoint.kind]}. ${
            isStop ? de.waypoints.toShape : de.waypoints.toStop
          }`}
          title={
            kindLocked
              ? de.waypoints.endpointIsStop
              : isStop
                ? de.waypoints.toShape
                : de.waypoints.toStop
          }
          className="flex size-5 shrink-0 items-center justify-center rounded-full disabled:cursor-default"
          onClick={() =>
            edit(path('kind'), (p) =>
              setWaypointKind(p, trackId, waypoint.id, isStop ? 'shape' : 'stop'),
            )
          }
        >
          {/* A filled, numbered dot for a stop, a small hollow ring for a shape point. */}
          {isStop ? (
            <span
              className="flex size-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
              style={{ backgroundColor: color }}
            >
              {number}
            </span>
          ) : (
            <span
              className="size-2.5 rounded-full"
              style={{ boxShadow: `inset 0 0 0 2px ${color}` }}
            />
          )}
        </button>
        <TextField
          label={de.waypoints.name(number)}
          labelHidden
          value={waypoint.name}
          placeholder={isStop ? undefined : de.waypoints.unnamedShape}
          className="flex-1"
          onCommit={(name) => change('name', (w) => ({ ...w, name }), true)}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={de.waypoints.actions(number)}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            // As in the tree: act once the menu has closed, so the dialog keeps the focus.
            onCloseAutoFocus={(event) => {
              const action = afterClose.current;
              if (!action) return;
              afterClose.current = null;
              event.preventDefault();
              action();
            }}
          >
            <DropdownMenuItem onSelect={onShowOnMap}>{de.map.showOnMap}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => (afterClose.current = onEditCoordinates)}>
              {de.waypoints.editCoordinates}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={index === 0} onSelect={() => move(index - 1)}>
              {de.waypoints.moveUp}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={index === count - 1} onSelect={() => move(index + 1)}>
              {de.waypoints.moveDown}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => edit('waypoints', (p) => removeWaypoint(p, trackId, waypoint.id))}
            >
              {de.common.delete}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isStop ? (
        // Wraps instead of squeezing: in a narrow inspector the switch moves below the hold.
        <div className="mt-1.5 flex flex-wrap items-end gap-x-3 gap-y-1.5 pl-[2.75rem]">
          <NumberField
            label={de.waypoints.hold}
            value={waypoint.holdSec}
            unit={de.fields.seconds}
            step={0.5}
            className="w-20 shrink-0"
            onCommit={(holdSec) => change('holdSec', (w) => ({ ...w, holdSec }), true)}
          />
          <SwitchField
            label={de.waypoints.showLabel}
            checked={waypoint.showLabel}
            className="min-w-0 flex-1 basis-28 pb-1.5"
            onCommit={(showLabel) => change('showLabel', (w) => ({ ...w, showLabel }))}
          />
        </div>
      ) : (
        <p className="text-muted-foreground mt-1 pl-[2.75rem] text-xs">{de.waypoints.shapeNote}</p>
      )}
    </li>
  );
}
