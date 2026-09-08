import { Item, Switch } from "@jaquelene/ui";
import { colors } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useId } from "react";
import { PreferenceSelectItem } from "@/feature/settings/preference-select";
import { markdownEditorPreferencesQuery, useSetMarkdownEditorPreference } from "./preferences";
import {
  markdownEditorRowOptions,
  statisticPreferences,
  type MarkdownStatisticPreferenceKey,
} from "./preference-presentation";

function StatisticSetting({
  preferenceKey,
  label,
  checked,
}: {
  preferenceKey: MarkdownStatisticPreferenceKey;
  label: string;
  checked: boolean;
}) {
  const setting = useSetMarkdownEditorPreference(preferenceKey);
  const controlId = useId();
  const labelId = useId();
  const errorId = useId();
  let descriptionId: string | undefined;
  if (setting.error) {
    descriptionId = errorId;
  }
  return (
    <Item.Root>
      <Item.Content>
        <Item.Label id={labelId} render={<label htmlFor={controlId} />}>
          {label}
        </Item.Label>
        {setting.error && (
          <Item.Description id={errorId} role="alert" style={styles.error}>
            Couldn't save the preference.
          </Item.Description>
        )}
      </Item.Content>
      <Item.Value>
        <Switch
          id={controlId}
          aria-labelledby={labelId}
          aria-describedby={descriptionId}
          aria-busy={setting.pending || undefined}
          checked={checked}
          disabled={setting.pending}
          onCheckedChange={setting.setValue}
        />
      </Item.Value>
    </Item.Root>
  );
}

export function MarkdownEditorSettingsSection() {
  const { data: preferences } = useSuspenseQuery(markdownEditorPreferencesQuery);
  const maxRows = useSetMarkdownEditorPreference("maxRows");
  const headingId = useId();
  let rowsError: string | null = null;
  if (maxRows.error) {
    rowsError = "Couldn't save the row limit.";
  }

  return (
    <Item.Section aria-labelledby={headingId}>
      <Item.SectionHeader>
        <Item.Heading id={headingId}>Markdown Editor</Item.Heading>
      </Item.SectionHeader>
      <Item.Group>
        <PreferenceSelectItem
          label="Max rows"
          value={preferences.maxRows}
          options={markdownEditorRowOptions}
          disabled={maxRows.pending}
          error={rowsError}
          onValueChange={maxRows.setValue}
        />
        {statisticPreferences.map(({ key, label }) => (
          <StatisticSetting
            key={key}
            preferenceKey={key}
            label={label}
            checked={preferences[key]}
          />
        ))}
      </Item.Group>
    </Item.Section>
  );
}

const styles = stylex.create({ error: { color: colors.foregroundDanger } });
