import { moveWaypoint, type Etappe, type Id, type Track } from '@travel-route-animator/core';
import { DragDropProvider, type DragDropEventHandlers } from '@dnd-kit/react';
import { useRef, useState } from 'react';
import { de } from '@/i18n/de';
import { DND_PLUGINS, DND_SENSORS, rowUnderPointer, type DragOperation } from '@/lib/dnd';
import { insertIndex } from '@/lib/insertIndex';
import { Section } from '../parts';
import type { Edit } from '../useEdit';
import { CoordinatesDialog } from './CoordinatesDialog';
import { PlaceSearch } from './PlaceSearch';
import { WaypointRow } from './WaypointRow';

interface DropTarget {
  id: Id;
  position: 'before' | 'after';
}

function dropTargetOf(operation: DragOperation, nativeEvent?: Event): DropTarget | null {
  const row = rowUnderPointer(operation, nativeEvent, 'data-waypoint-id');
  return row ? { id: row.id, position: row.relativeY < 0.5 ? 'before' : 'after' } : null;
}

export function WaypointList({
  track,
  etappe,
  edit,
}: {
  track: Track;
  etappe: Etappe;
  edit: Edit;
}) {
  const { waypoints } = track;
  const [coordinatesFor, setCoordinatesFor] = useState<Id | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  // onDragMove fires on every pointer move; only re-render when the target actually changes.
  const dropTargetRef = useRef<DropTarget | null>(null);

  function updateDropTarget(next: DropTarget | null) {
    const current = dropTargetRef.current;
    if (current?.id === next?.id && current?.position === next?.position) return;
    dropTargetRef.current = next;
    setDropTarget(next);
  }

  const dragHandlers: Partial<DragDropEventHandlers> = {
    onDragMove: (event) => updateDropTarget(dropTargetOf(event.operation, event.nativeEvent)),
    onDragEnd: (event) => {
      const target = dropTargetOf(event.operation, event.nativeEvent);
      updateDropTarget(null);
      const draggedId = event.operation.source?.id;
      if (event.canceled || !target || draggedId === undefined) return;
      const from = waypoints.findIndex((waypoint) => waypoint.id === String(draggedId));
      const to = waypoints.findIndex((waypoint) => waypoint.id === target.id);
      if (from === -1 || to === -1) return;
      const index = insertIndex(to, target.position, from);
      if (index !== from) {
        edit('waypoints', (p) => moveWaypoint(p, track.id, String(draggedId), index));
      }
    },
  };

  const coordinatesIndex = waypoints.findIndex((waypoint) => waypoint.id === coordinatesFor);

  return (
    <Section title={de.waypoints.title}>
      <PlaceSearch track={track} etappe={etappe} edit={edit} />
      {waypoints.length === 0 ? (
        <p className="text-muted-foreground">{de.waypoints.empty}</p>
      ) : (
        <DragDropProvider sensors={DND_SENSORS} plugins={DND_PLUGINS} {...dragHandlers}>
          <ol aria-label={de.waypoints.title} className="select-none">
            {waypoints.map((waypoint, index) => (
              <WaypointRow
                key={waypoint.id}
                trackId={track.id}
                waypoint={waypoint}
                index={index}
                count={waypoints.length}
                color={track.style.lineColor}
                edit={edit}
                dropIndicator={dropTarget?.id === waypoint.id ? dropTarget.position : null}
                onEditCoordinates={() => setCoordinatesFor(waypoint.id)}
              />
            ))}
          </ol>
        </DragDropProvider>
      )}
      <CoordinatesDialog
        trackId={track.id}
        waypoint={waypoints[coordinatesIndex]}
        index={coordinatesIndex}
        edit={edit}
        onClose={() => setCoordinatesFor(null)}
      />
    </Section>
  );
}
