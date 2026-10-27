import {
  ArrowLeft,
  Check,
  CircleAlert,
  LoaderCircle,
  Pencil,
  Play,
  Redo2,
  Undo2,
} from 'lucide-react';
import { SegmentedControl, type SegmentOption } from '@/components/SegmentedControl';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { de } from '@/i18n/de';
import { cn } from '@/lib/utils';
import {
  selectCanRedo,
  selectCanUndo,
  selectProject,
  useEditor,
  type Workspace,
} from '@/state/editorStore';

const WORKSPACES: SegmentOption<Workspace>[] = [
  {
    value: 'edit',
    label: (
      <>
        <Pencil /> {de.editor.workspace.edit}
      </>
    ),
    hint: de.editor.workspace.editHint,
  },
  {
    value: 'preview',
    label: (
      <>
        <Play /> {de.editor.workspace.preview}
      </>
    ),
    hint: de.editor.workspace.previewHint,
  },
];

export function EditorHeader() {
  const project = useEditor(selectProject);
  const canUndo = useEditor(selectCanUndo);
  const canRedo = useEditor(selectCanRedo);
  const undo = useEditor((state) => state.undo);
  const redo = useEditor((state) => state.redo);
  const select = useEditor((state) => state.select);
  const workspace = useEditor((state) => state.workspace);
  const setWorkspace = useEditor((state) => state.setWorkspace);

  return (
    <header className="bg-card flex h-10 shrink-0 items-center gap-2 border-b px-2">
      <Button variant="ghost" size="sm" asChild>
        <a href="#/">
          <ArrowLeft /> {de.editor.backToProjects}
        </a>
      </Button>
      <h1 className="min-w-0 truncate font-semibold">
        <button
          type="button"
          className="hover:text-primary max-w-full truncate"
          title={de.editor.showProjectSettings}
          onClick={() => select(project.id)}
        >
          {project.name}
        </button>
      </h1>
      <SegmentedControl
        label={de.editor.workspace.label}
        value={workspace}
        options={WORKSPACES}
        onChange={setWorkspace}
        className="ml-4 shrink-0 text-sm"
      />
      <div className="ml-auto flex items-center gap-1">
        <IconButton label={de.editor.undo} disabled={!canUndo} onClick={undo}>
          <Undo2 />
        </IconButton>
        <IconButton label={de.editor.redo} disabled={!canRedo} onClick={redo}>
          <Redo2 />
        </IconButton>
        <SaveIndicator />
      </div>
    </header>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* The span keeps the tooltip working on a disabled button. */}
        <span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function SaveIndicator() {
  const status = useEditor((state) => state.saveStatus);
  const retry = useEditor((state) => state.retrySave);

  if (status.state === 'error') {
    return (
      <div role="alert" className="text-destructive flex items-center gap-2 pl-2 text-xs">
        <CircleAlert className="size-4" />
        <span title={status.message}>{de.editor.save.error}</span>
        <Button variant="outline" size="xs" onClick={() => void retry()}>
          {de.common.retry}
        </Button>
      </div>
    );
  }
  return (
    <span
      role="status"
      className={cn(
        'text-muted-foreground flex w-44 items-center justify-end gap-1.5 pl-2 text-xs',
        status.state === 'pending' && 'text-foreground',
      )}
    >
      {status.state === 'saved' && <Check className="size-3.5" />}
      {status.state === 'saving' && <LoaderCircle className="size-3.5 animate-spin" />}
      {de.editor.save[status.state]}
    </span>
  );
}
