import type { UiTheme } from "@jaquelene/ipc/renderer";
import { Item } from "@jaquelene/ui";
import { Select } from "@jaquelene/ui/select";
import { colors, radii, tokens } from "@jaquelene/ui/tokens.stylex";
import { Radio, RadioGroup, useRadioStore } from "@ariakit/react/radio";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useId } from "react";
import { uiFonts } from "@/feature/appearance/user-interface/font";
import { motionPreferences } from "@/feature/appearance/user-interface/motion";
import {
  userInterfacePreferencesQuery,
  useSetInterfaceScale,
  useSetMotion,
  useSetUiFont,
  useSetUiTheme,
} from "@/feature/appearance/user-interface/query";
import { interfaceScales } from "@/feature/appearance/user-interface/scale";
import { ThemeSwatch } from "@/feature/appearance/user-interface/theme-swatch";
import { uiThemes } from "@/feature/appearance/user-interface/theme";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/settings/appearance")({
  loader: ({ context }) => context.queryClient.query(userInterfacePreferencesQuery),
  component: AppearanceRoute,
});

type PreferenceOption<Value extends string> = {
  label: string;
  value: Value;
};

type PreferenceSelectItemProps<Value extends string> = {
  disabled: boolean;
  error: string | null;
  label: string;
  onValueChange: (value: Value) => void;
  options: readonly PreferenceOption<Value>[];
  value: Value;
};

function PreferenceSelectItem<Value extends string>({
  disabled,
  error,
  label,
  onValueChange,
  options,
  value,
}: PreferenceSelectItemProps<Value>) {
  const controlId = useId();
  const errorId = useId();
  const labelId = useId();
  const selectedOption = options.find((option) => option.value === value);

  if (!selectedOption) {
    throw new TypeError(`Unknown preference value "${value}".`);
  }

  return (
    <Item.Root>
      <Item.Content>
        <Item.Label id={labelId} render={<label htmlFor={controlId} />}>
          {label}
        </Item.Label>
        {error ? (
          <Item.Description id={errorId} role="alert" style={styles.error}>
            {error}
          </Item.Description>
        ) : null}
      </Item.Content>

      <Item.Value>
        <Select.Root
          selectedValue={value}
          setSelectedValue={(nextValue) => {
            const nextOption = options.find((option) => option.value === nextValue);

            if (!nextOption) {
              throw new TypeError(`Unknown preference value "${nextValue}".`);
            }

            if (nextOption.value !== value) {
              onValueChange(nextOption.value);
            }
          }}
        >
          <Select
            id={controlId}
            aria-labelledby={labelId}
            aria-describedby={error ? errorId : undefined}
            disabled={disabled}
            style={styles.select}
          >
            <Select.Value>{selectedOption.label}</Select.Value>
          </Select>

          <Select.Content aria-labelledby={labelId}>
            {options.map((option) => (
              <Select.Item key={option.value} value={option.value}>
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.Indicator />
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Item.Value>
    </Item.Root>
  );
}

type ThemePreferenceItemProps = {
  disabled: boolean;
  error: string | null;
  onValueChange: (value: UiTheme) => void;
  value: UiTheme;
};

function ThemePreferenceItem({ disabled, error, onValueChange, value }: ThemePreferenceItemProps) {
  const errorId = useId();
  const labelId = useId();
  const options = Object.values(uiThemes);
  const store = useRadioStore({
    value,
    setValue(nextValue) {
      const nextTheme = options.find((option) => option.value === nextValue);

      if (!nextTheme) {
        throw new TypeError(`Unknown UI theme "${nextValue}".`);
      }

      if (nextTheme.value !== value) {
        onValueChange(nextTheme.value);
      }
    },
  });

  return (
    <Item.Root style={styles.themeItem}>
      <Item.Content>
        <Item.Label id={labelId}>Theme</Item.Label>
        {error ? (
          <Item.Description id={errorId} role="alert" style={styles.error}>
            {error}
          </Item.Description>
        ) : null}
      </Item.Content>

      <Item.Value>
        <RadioGroup
          store={store}
          aria-labelledby={labelId}
          aria-describedby={error ? errorId : undefined}
          disabled={disabled}
          {...stylex.props(styles.themeGroup)}
        >
          {options.map((option) => {
            const selected = option.value === value;

            return (
              <Radio
                key={option.value}
                store={store}
                value={option.value}
                render={<button type="button" />}
                {...stylex.props(styles.themeOption)}
              >
                <ThemeSwatch selected={selected} theme={option.style} />
                <span {...stylex.props(styles.themeLabel, selected && styles.themeLabelSelected)}>
                  {option.label}
                </span>
              </Radio>
            );
          })}
        </RadioGroup>
      </Item.Value>
    </Item.Root>
  );
}

function AppearanceRoute() {
  const { data: preferences } = useSuspenseQuery(userInterfacePreferencesQuery);
  const setInterfaceScale = useSetInterfaceScale();
  const setMotion = useSetMotion();
  const setUiFont = useSetUiFont();
  const setUiTheme = useSetUiTheme();

  return (
    <>
      <ContentPane.Header>
        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>Settings</Breadcrumb.Item>
            <Breadcrumb.Item>
              <Breadcrumb.Page>Appearance</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <ContentPane.Body>
          <Item.Section aria-labelledby="user-interface-heading">
            <Item.Heading id="user-interface-heading">User Interface</Item.Heading>

            <Item.Group>
              <PreferenceSelectItem
                disabled={setUiFont.isPending}
                error={setUiFont.isError ? "Couldn't save the font." : null}
                label="Font"
                onValueChange={setUiFont.mutate}
                options={Object.values(uiFonts)}
                value={preferences.font}
              />

              <PreferenceSelectItem
                disabled={setInterfaceScale.isPending}
                error={setInterfaceScale.isError ? "Couldn't save the interface scale." : null}
                label="Interface scale"
                onValueChange={setInterfaceScale.mutate}
                options={Object.values(interfaceScales)}
                value={preferences.scale}
              />

              <PreferenceSelectItem
                disabled={setMotion.isPending}
                error={setMotion.isError ? "Couldn't save the motion preference." : null}
                label="Motion"
                onValueChange={setMotion.mutate}
                options={Object.values(motionPreferences)}
                value={preferences.motion}
              />

              <ThemePreferenceItem
                disabled={setUiTheme.isPending}
                error={setUiTheme.isError ? "Couldn't save the theme." : null}
                onValueChange={setUiTheme.mutate}
                value={preferences.theme}
              />
            </Item.Group>
          </Item.Section>
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  error: {
    color: colors.foregroundDanger,
  },
  select: {
    minWidth: "8rem",
  },
  themeItem: {
    alignItems: "flex-start",
    flexDirection: "column",
    gap: "1rem",
    justifyContent: "flex-start",
  },
  themeGroup: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.75rem",
  },
  themeOption: {
    alignItems: "center",
    borderRadius: radii.control,
    color: colors.foregroundSecondary,
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    minWidth: "4rem",
    opacity: {
      default: 1,
      ":disabled": 0.5,
    },
    outlineColor: {
      default: null,
      ":is([data-focus-visible])": colors.focusRing,
    },
    outlineOffset: {
      default: null,
      ":is([data-focus-visible])": 2,
    },
    outlineStyle: {
      default: "none",
      ":is([data-focus-visible])": "solid",
    },
    outlineWidth: {
      default: null,
      ":is([data-focus-visible])": 1,
    },
    padding: "0.25rem",
  },
  themeLabel: {
    color: colors.foregroundSecondary,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    textBox: "trim-both text",
  },
  themeLabelSelected: {
    color: colors.foregroundPrimary,
  },
});
