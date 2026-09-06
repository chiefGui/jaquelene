import { CAMPAIGN_SCENARIO_MAX_UTF16_LENGTH, campaignScenarioSchema } from "@jaquelene/domain";
import type { Campaign } from "@jaquelene/ipc/renderer";
import { Button, Field, Form, Item } from "@jaquelene/ui";
import * as stylex from "@stylexjs/stylex";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { MarkdownEditor } from "@/feature/markdown/editor/markdown-editor";
import { ScenarioImportControl } from "@/feature/scenario/import-control";
import { formatCampaignScenarioIssue } from "./form";
import { useSetCampaignScenario } from "./query";

function ScenarioEditor({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const [scenario, setScenario] = useState(campaign.scenario);
  const [error, setError] = useState<string | undefined>();
  const setScenarioMutation = useSetCampaignScenario(campaign.id);
  const errorId = useId();
  const descriptionId = useId();
  const saving = useRef(false);
  let saveLabel = "Save";
  if (setScenarioMutation.isPending) {
    saveLabel = "Saving…";
  }

  async function save() {
    if (saving.current) {
      return;
    }
    const result = campaignScenarioSchema.safeParse(scenario);
    if (!result.success) {
      setError(formatCampaignScenarioIssue());
      return;
    }
    setError(undefined);
    saving.current = true;
    try {
      await setScenarioMutation.mutateAsync(result.data);
      onClose();
    } catch (cause) {
      reportError("campaign.scenario.update", cause);
      setError("Couldn't save the scenario. Try again.");
    } finally {
      saving.current = false;
    }
  }

  return (
    <form
      aria-label="Edit scenario"
      aria-busy={setScenarioMutation.isPending || undefined}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      {...stylex.props(styles.editor)}
    >
      <MarkdownEditor.Root
        aria-label="Scenario"
        aria-describedby={`${descriptionId} ${errorId}`}
        autoFocus
        value={scenario}
        onValueChange={(value) => {
          setScenario(value);
          setError(undefined);
        }}
        maxLength={CAMPAIGN_SCENARIO_MAX_UTF16_LENGTH}
        readOnly={setScenarioMutation.isPending}
        placeholder="Describe the setting, universe, or starting situation."
      >
        <MarkdownEditor.Frame>
          <MarkdownEditor.Toolbar>
            <MarkdownEditor.FormattingActions />
            <ScenarioImportControl />
            <MarkdownEditor.PreviewToggle style={styles.preview} />
          </MarkdownEditor.Toolbar>
          <MarkdownEditor.Content />
        </MarkdownEditor.Frame>
      </MarkdownEditor.Root>
      <Field.Description id={descriptionId}>
        Changes apply to future replies. Leave empty to remove.
      </Field.Description>
      <Form.Status id={errorId} role="alert" tone="danger">
        {error}
      </Form.Status>
      <div {...stylex.props(styles.actions)}>
        <Button
          type="button"
          variant="ghost"
          disabled={setScenarioMutation.isPending}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={setScenarioMutation.isPending} style={styles.save}>
          {saveLabel}
        </Button>
      </div>
    </form>
  );
}

export function CampaignScenarioControl({ campaign }: { campaign: Campaign }) {
  const [editing, setEditing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const editorId = useId();
  let action = "Add";
  if (campaign.scenario) {
    action = "Edit";
  }

  useLayoutEffect(() => {
    if (!editing && restoreFocus.current) {
      restoreFocus.current = false;
      trigger.current?.focus();
    }
  }, [editing]);

  function close() {
    restoreFocus.current = true;
    setEditing(false);
  }

  return (
    <div>
      <Item.Root inset="none" style={styles.row}>
        <Item.Label>Scenario</Item.Label>
        <Button
          ref={trigger}
          type="button"
          variant="ghost"
          aria-label="Edit scenario"
          aria-expanded={editing}
          aria-controls={editorId}
          disabled={editing}
          style={styles.trigger}
          onClick={() => setEditing(true)}
        >
          {action}
        </Button>
      </Item.Root>
      <div id={editorId}>{editing && <ScenarioEditor campaign={campaign} onClose={close} />}</div>
    </div>
  );
}

const styles = stylex.create({
  row: { minHeight: 0, gap: "1rem" },
  editor: { display: "grid", gap: "0.5rem", marginBlockStart: "0.5rem" },
  actions: { display: "flex", justifyContent: "flex-end", gap: "0.5rem" },
  preview: { marginLeft: "auto" },
  save: { minWidth: "5rem" },
  trigger: { minWidth: "3.5rem" },
});
