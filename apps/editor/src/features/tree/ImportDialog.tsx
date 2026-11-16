import {
  importTrack,
  measureLine,
  parseTrackBytes,
  suggestStops,
  unpackTrackFile,
  toImportedLine,
  VEHICLE_TYPES,
  vehicleForActivity,
  type Added,
  type ImportedTrackData,
  type Project,
  type VehicleType,
} from '@travel-route-animator/core';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SelectField } from '@/features/inspector/fields/SelectField';
import { SwitchField } from '@/features/inspector/fields/SwitchField';
import { optionsOf } from '@/features/inspector/parts';
import { de } from '@/i18n/de';
import { browserUnpacker } from '@/lib/unpack';

interface ImportDialogProps {
  /** The stage the track goes into; null closes the dialog. */
  etappeId: string | null;
  onClose: () => void;
  /** Adds the track as one undo step and selects it. */
  onImport: (change: (project: Project) => Added) => void;
}

/** What the dialog shows about a file before it is imported. */
interface Preview {
  data: ImportedTrackData;
  lengthKm: number;
  points: number;
  hasHeights: boolean;
  /** Timestamps and heart rate (M16): real pace, speed, clock and pulse. */
  hasTime: boolean;
  hasHeartRate: boolean;
  stops: number;
}

const STOP_NAMES = {
  start: de.importTrack.stopNames.start,
  end: de.importTrack.stopNames.end,
  pause: de.importTrack.stopNames.pause,
};

/**
 * "Aus Datei importieren": a GPX, FIT or TCX recording (also zipped, as Garmin Connect and
 * Strava export them) or the GPS of a DJI drone's subtitle file becomes a vehicle of the stage
 * (ADR 0014, M16). The file is read in the browser; nothing goes to a server.
 */
export function ImportDialog({ etappeId, onClose, onImport }: ImportDialogProps) {
  const fileId = useId();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string>();
  const [vehicle, setVehicle] = useState<VehicleType>('bike');
  const [withStops, setWithStops] = useState(true);

  const reset = () => {
    setPreview(null);
    setError(undefined);
    setWithStops(true);
  };

  async function read(file: File) {
    reset();
    try {
      const unpacked = await unpackTrackFile(
        new Uint8Array(await file.arrayBuffer()),
        file.name,
        browserUnpacker,
      );
      const data = parseTrackBytes(unpacked.bytes, unpacked.fileName);
      const line = toImportedLine(data);
      setPreview({
        data,
        lengthKm: measureLine(line.line).lengthM / 1000,
        points: data.points.length,
        hasHeights: line.elevationsM !== undefined,
        hasTime: line.recording !== undefined,
        hasHeartRate: line.recording?.heartRateBpm !== undefined,
        stops: suggestStops(data, STOP_NAMES).length,
      });
      setVehicle(vehicleForActivity(data));
    } catch (reason) {
      setError(
        de.importTrack.unreadable(reason instanceof Error ? reason.message : String(reason)),
      );
    }
  }

  const keep =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      return null;
    };

  return (
    <Dialog
      open={etappeId !== null}
      onOpenChange={(open) => {
        if (open) return;
        reset();
        onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{de.importTrack.title}</DialogTitle>
          <DialogDescription>{de.importTrack.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <label htmlFor={fileId} className="text-muted-foreground text-xs">
            {de.importTrack.file}
          </label>
          <input
            id={fileId}
            type="file"
            accept=".gpx,.fit,.tcx,.zip,.gz,.srt,application/gpx+xml"
            className="text-sm"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void read(file);
            }}
          />
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        {preview && (
          <>
            <p role="status" className="text-sm">
              {de.importTrack.summary(
                preview.data.name,
                preview.lengthKm,
                preview.points,
                preview.hasHeights,
              )}{' '}
              {de.importTrack.measured(preview.hasTime, preview.hasHeartRate)}
            </p>
            <SelectField
              label={de.importTrack.vehicle}
              value={vehicle}
              options={optionsOf(VEHICLE_TYPES, de.vehicles, (type) => type === 'plane')}
              hint={preview.data.source === 'dji-srt' ? de.importTrack.droneHint : undefined}
              onCommit={keep(setVehicle)}
            />
            <SwitchField
              label={de.importTrack.withStops(preview.stops - 2)}
              checked={withStops}
              disabled={preview.stops <= 2}
              onCommit={keep(setWithStops)}
            />
          </>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {de.common.cancel}
          </Button>
          <Button
            type="button"
            disabled={!preview}
            onClick={() => {
              if (!preview || etappeId === null) return;
              const { data } = preview;
              onImport((project) =>
                importTrack(project, etappeId, data, {
                  vehicleType: vehicle,
                  names: STOP_NAMES,
                  withStops,
                }),
              );
              reset();
              onClose();
            }}
          >
            {de.importTrack.import}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
