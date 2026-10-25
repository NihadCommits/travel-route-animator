import { editWaypoint, type Id, type LngLat, type Waypoint } from '@travel-route-animator/core';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { de } from '@/i18n/de';
import { NumberField } from '../fields/NumberField';
import { Row } from '../parts';
import type { Edit } from '../useEdit';

export interface CoordinatesDialogProps {
  trackId: Id;
  /** The waypoint as it is now in the store; undefined closes the dialog. */
  waypoint: Waypoint | undefined;
  index: number;
  edit: Edit;
  onClose: () => void;
}

/**
 * Exact coordinates, e.g. copied from a map service. Like every inspector field they are
 * stored as soon as they are valid, so "Fertig" only closes the dialog. Each field checks its
 * own half of [lng, lat]; a latitude beyond ±90 gets the hint that the order may be swapped.
 */
export function CoordinatesDialog({
  trackId,
  waypoint,
  index,
  edit,
  onClose,
}: CoordinatesDialogProps) {
  const setCoordinate = (axis: 0 | 1, value: number) =>
    edit(
      `waypoints[${index}].lngLat[${axis}]`,
      (p) =>
        editWaypoint(p, trackId, waypoint!.id, (w) => {
          const lngLat: LngLat = [...w.lngLat];
          lngLat[axis] = value;
          return { ...w, lngLat };
        }),
      { coalesce: true },
    );

  return (
    <Dialog open={waypoint !== undefined} onOpenChange={(open) => !open && onClose()}>
      {waypoint && (
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {de.waypoints.coordinatesTitle(waypoint.name || de.waypoints.unnamedShape)}
            </DialogTitle>
            <DialogDescription>{de.waypoints.coordinatesHint}</DialogDescription>
          </DialogHeader>
          <Row>
            <NumberField
              label={de.waypoints.longitude}
              value={waypoint.lngLat[0]}
              unit={de.fields.degrees}
              step={0.001}
              fractionDigits={6}
              onCommit={(lng) => setCoordinate(0, lng)}
            />
            <NumberField
              label={de.waypoints.latitude}
              value={waypoint.lngLat[1]}
              unit={de.fields.degrees}
              step={0.001}
              fractionDigits={6}
              onCommit={(lat) => setCoordinate(1, lat)}
            />
          </Row>
          <DialogFooter>
            <Button onClick={onClose}>{de.waypoints.done}</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
