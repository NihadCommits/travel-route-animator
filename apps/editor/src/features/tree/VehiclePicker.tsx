import { VEHICLE_TYPES, type VehicleType } from '@travel-route-animator/core';
import { FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { VEHICLE_ICONS } from '@/features/editor/vehicleIcons';
import { de } from '@/i18n/de';

interface VehiclePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (vehicle: VehicleType) => void;
  /** Opens the import of a GPX or DJI file instead (M14). */
  onImport: () => void;
}

/** Tiles with icons instead of a dropdown: the vehicle is the first decision for a track. */
export function VehiclePicker({ open, onOpenChange, onPick, onImport }: VehiclePickerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{de.tree.vehiclePickerTitle}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          {VEHICLE_TYPES.map((vehicle) => {
            const Icon = VEHICLE_ICONS[vehicle];
            return (
              <button
                key={vehicle}
                type="button"
                className="bg-secondary hover:bg-accent focus-visible:ring-ring flex flex-col items-center gap-2 rounded-md border p-3 outline-none focus-visible:ring-2"
                onClick={() => {
                  onPick(vehicle);
                  onOpenChange(false);
                }}
              >
                <Icon className="size-6" />
                <span>{de.vehicles[vehicle]}</span>
              </button>
            );
          })}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onOpenChange(false);
            onImport();
          }}
        >
          <FileUp /> {de.importTrack.open}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
