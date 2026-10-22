import { editGroup, renameItem, type Group, type ItemLocation } from '@travel-route-animator/core';
import { de } from '@/i18n/de';
import { ColorField } from './fields/ColorField';
import { TextField } from './fields/TextField';
import { FormHeading, LaterNote } from './parts';
import { useEdit } from './useEdit';

export function GroupForm({ group, location }: { group: Group; location: ItemLocation }) {
  const edit = useEdit(location);

  return (
    <>
      <FormHeading kind={de.inspector.kinds.group} name={group.name} />
      <TextField
        label={de.inspector.name}
        value={group.name}
        onCommit={(name) => edit('name', (p) => renameItem(p, group.id, name), { coalesce: true })}
      />
      <ColorField
        label={de.inspector.group.color}
        value={group.color}
        allowNone
        onCommit={(color) =>
          edit(
            'color',
            (p) =>
              editGroup(p, group.id, ({ color: _old, ...rest }) =>
                color === undefined ? rest : { ...rest, color },
              ),
            { coalesce: true },
          )
        }
      />
      <LaterNote text={de.inspector.group.later} />
    </>
  );
}
