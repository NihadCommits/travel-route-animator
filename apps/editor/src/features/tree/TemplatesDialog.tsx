import {
  insertTemplate,
  locateItem,
  type Added,
  type Id,
  type Project,
  type Template,
} from '@travel-route-animator/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderTree, Route, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { de } from '@/i18n/de';
import { api } from '@/lib/api';

export const TEMPLATES_QUERY_KEY = ['templates'];

interface TemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  /** Where a stage template goes: the group of the selection, else the first group. */
  selectedId: Id | null;
  onInsert: (change: (project: Project) => Added) => void;
}

/** The group a new stage goes into: the selected group, or the group of the selected item. */
function targetGroup(project: Project, selectedId: Id | null): Id | undefined {
  const location = selectedId !== null ? locateItem(project, selectedId) : undefined;
  if (location && location.kind !== 'project') return project.groups[location.groupIndex]!.id;
  return project.groups[0]?.id;
}

/**
 * "Aus Vorlage": stages and groups saved as templates, from any project (M14). A stage goes
 * into the selected group, a group to the end of the project.
 */
export function TemplatesDialog({
  open,
  onOpenChange,
  project,
  selectedId,
  onInsert,
}: TemplatesDialogProps) {
  const queryClient = useQueryClient();
  const templates = useQuery({
    queryKey: TEMPLATES_QUERY_KEY,
    queryFn: api.listTemplates,
    enabled: open,
  });
  const groupId = targetGroup(project, selectedId);
  const groupName = project.groups.find((g) => g.id === groupId)?.name;

  async function remove(template: Template) {
    await api.deleteTemplate(template.id);
    await queryClient.invalidateQueries({ queryKey: TEMPLATES_QUERY_KEY });
  }

  const list = templates.data ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{de.templates.title}</DialogTitle>
          <DialogDescription>
            {groupName ? de.templates.whereStage(groupName) : de.templates.noGroup}
          </DialogDescription>
        </DialogHeader>
        {templates.isError && (
          <p role="alert" className="text-destructive text-sm">
            {de.templates.unavailable}
          </p>
        )}
        {templates.isSuccess && list.length === 0 && (
          <p className="text-muted-foreground text-sm">{de.templates.empty}</p>
        )}
        {list.length > 0 && (
          <ul aria-label={de.templates.title} className="grid gap-1">
            {list.map((template) => {
              const Icon = template.kind === 'group' ? FolderTree : Route;
              const blocked = template.kind === 'etappe' && groupId === undefined;
              return (
                <li key={template.id} className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex-1 justify-start"
                    disabled={blocked}
                    onClick={() => {
                      onInsert((p) => insertTemplate(p, template, groupId ? { groupId } : {}));
                      onOpenChange(false);
                    }}
                  >
                    <Icon /> {template.name}
                    <span className="text-muted-foreground ml-auto text-xs">
                      {de.templates.kinds[template.kind]}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={de.templates.remove(template.name)}
                    onClick={() => void remove(template)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
