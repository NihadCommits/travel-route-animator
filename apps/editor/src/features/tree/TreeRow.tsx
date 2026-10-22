import { useDraggable } from '@dnd-kit/react';
import type { Id } from '@travel-route-animator/core';
import { ChevronRight, Plus, TriangleAlert } from 'lucide-react';
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { de } from '@/i18n/de';
import type { DropPosition, TreeItemKind } from './drop';

export interface TreeRowProps {
  id: Id;
  kind: TreeItemKind;
  level: number;
  label: string;
  icon: ReactNode;
  /** Undefined for leaves; true/false for items that can be opened. */
  expanded?: boolean;
  onToggle?: () => void;
  selected: boolean;
  onSelect: () => void;
  renaming: boolean;
  onStartRename: () => void;
  onRename: (name: string) => void;
  onCancelRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  add?: { label: string; onAdd: () => void };
  /** Translated reasons why this item cannot be rendered yet (ADR 0002). */
  warnings?: readonly string[];
  /** Where a dragged item would land on this row, if it is the current drop target. */
  dropIndicator?: DropPosition | null;
  children?: ReactNode;
}

export function TreeRow(props: TreeRowProps) {
  const { id, kind, level, label, icon, expanded, selected, renaming, add, children } = props;
  const { warnings = [], dropIndicator } = props;
  const afterClose = useRef<(() => void) | null>(null);

  // dnd-kit handles the dragging itself. Where the row lands is found from the pointer position
  // via the data-tree-* attributes below (see dropTargetOf in ProjectTree) and decided in drop.ts.
  const { ref: dragRef, isDragging } = useDraggable({ id, type: kind, disabled: renaming });

  function handleKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    // Nested rows bubble their key events up; only react to keys on this row itself.
    if (event.target !== event.currentTarget) return;
    if (event.key === 'F2') {
      event.preventDefault();
      props.onStartRename();
    } else if (event.key === 'Delete') {
      event.preventDefault();
      props.onDelete();
    } else if (
      expanded !== undefined &&
      (event.key === 'ArrowRight' || event.key === 'ArrowLeft')
    ) {
      if ((event.key === 'ArrowRight') !== expanded) props.onToggle?.();
    }
  }

  return (
    <li
      role="treeitem"
      aria-level={level}
      aria-expanded={expanded}
      aria-selected={selected}
      aria-label={label || de.tree.unnamed}
      tabIndex={selected ? 0 : -1}
      onFocus={(event) => event.target === event.currentTarget && !selected && props.onSelect()}
      onKeyDown={handleKeyDown}
      className="outline-none [&:focus-visible>div]:ring-1 [&:focus-visible>div]:ring-inset"
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={dragRef}
            data-tree-id={id}
            data-tree-kind={kind}
            data-drop={dropIndicator ?? undefined}
            className={cn(
              'group/row ring-ring flex h-7 cursor-default items-center gap-1.5 pr-1 select-none',
              selected ? 'bg-primary/25' : 'hover:bg-accent',
              isDragging && 'opacity-60',
              // Insertion line above or below the row, or an outline when dropping into it.
              dropIndicator === 'before' && 'shadow-[inset_0_2px_0_var(--primary)]',
              dropIndicator === 'after' && 'shadow-[inset_0_-2px_0_var(--primary)]',
              dropIndicator === 'inside' && 'ring-primary bg-primary/15 ring-1 ring-inset',
            )}
            // Indentation shows the hierarchy; 14 px per level reads well at 13 px text.
            style={{ paddingLeft: 4 + (level - 1) * 14 }}
            onClick={props.onSelect}
            onDoubleClick={props.onStartRename}
          >
            {expanded === undefined ? (
              <span className="size-4 shrink-0" />
            ) : (
              <button
                type="button"
                tabIndex={-1}
                aria-label={expanded ? de.tree.collapse : de.tree.expand}
                className="text-muted-foreground hover:text-foreground shrink-0"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onToggle?.();
                }}
              >
                <ChevronRight
                  className={cn('size-4 transition-transform', expanded && 'rotate-90')}
                />
              </button>
            )}
            <span className="text-muted-foreground shrink-0 [&>svg]:size-4">{icon}</span>
            {renaming ? (
              <RenameInput
                initial={label}
                onDone={props.onRename}
                onCancel={props.onCancelRename}
              />
            ) : (
              <span
                className={cn('min-w-0 flex-1 truncate', !label && 'text-muted-foreground italic')}
              >
                {label || de.tree.unnamed}
              </span>
            )}
            {warnings.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <TriangleAlert
                    className="text-warning size-3.5 shrink-0"
                    aria-label={`${de.tree.notReady} ${warnings.join(' ')}`}
                  />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-64">
                  <p className="font-medium">{de.tree.notReady}</p>
                  <ul className="list-disc pl-4">
                    {warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </TooltipContent>
              </Tooltip>
            )}
            {add && (
              <button
                type="button"
                tabIndex={-1}
                aria-label={`+ ${add.label}`}
                title={`+ ${add.label}`}
                className="text-muted-foreground hover:text-foreground invisible shrink-0 group-hover/row:visible"
                onClick={(event) => {
                  event.stopPropagation();
                  add.onAdd();
                }}
              >
                <Plus className="size-4" />
              </button>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent
          // Menu actions run only once the menu is fully closed. Otherwise Radix moves the
          // focus back to this row afterwards, which steals it from the rename field of a new
          // item (and selects this row again) or from a dialog the action opened.
          onCloseAutoFocus={(event) => {
            const action = afterClose.current;
            if (!action) return;
            afterClose.current = null;
            event.preventDefault();
            action();
          }}
        >
          {add && (
            <>
              <ContextMenuItem
                onSelect={() => {
                  afterClose.current = add.onAdd;
                }}
              >
                + {add.label}
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem
            onSelect={() => {
              afterClose.current = props.onStartRename;
            }}
          >
            {de.common.rename}
            <ContextMenuShortcut>F2</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              afterClose.current = props.onDuplicate;
            }}
          >
            {de.common.duplicate}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onSelect={() => {
              afterClose.current = props.onDelete;
            }}
          >
            {de.common.delete}
            <ContextMenuShortcut>Entf</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {expanded && children && <ul role="group">{children}</ul>}
    </li>
  );
}

function RenameInput({
  initial,
  onDone,
  onCancel,
}: {
  initial: string;
  onDone: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      autoFocus
      // size=1 lets the field shrink to the row instead of widening the tree.
      size={1}
      aria-label={de.common.rename}
      value={value}
      className="bg-background border-primary min-w-0 flex-1 rounded-sm border px-1 outline-none"
      onFocus={(event) => event.target.select()}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') onDone(value.trim());
        if (event.key === 'Escape') onCancel();
      }}
      onBlur={() => onDone(value.trim())}
    />
  );
}
