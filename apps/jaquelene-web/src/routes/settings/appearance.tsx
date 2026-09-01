import { Item } from "@jaquelene/ui";
import { Select } from "@jaquelene/ui/select";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
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
  onValueChange: (value: (typeof uiThemes)[keyof typeof uiThemes]["value"]) => void;
  value: (typeof uiThemes)[keyof typeof uiThemes]["value"];
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
    <Item.Root>
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
                <span
                  aria-hidden="true"
                  {...stylex.props(
                    styles.themeOrb,
                    option.style,
                    selected && styles.themeOrbSelected,
                  )}
                >
                  <span {...stylex.props(styles.themeOrbCore)}>
                    <span {...stylex.props(styles.themeOrbLiquid)} />
                    <span {...stylex.props(styles.themeOrbShine)} />
                  </span>
                </span>
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
    color: colors.danger,
  },
  select: {
    minWidth: "8rem",
  },
  themeGroup: {
    alignItems: "center",
    display: "flex",
    gap: "0.75rem",
  },
  themeOption: {
    alignItems: "center",
    borderRadius: tokens.radiusMedium,
    color: colors.muted,
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    minWidth: "3.5rem",
    opacity: {
      default: 1,
      ":disabled": 0.5,
    },
    outlineColor: {
      default: null,
      ":is([data-focus-visible])": `color-mix(in oklab, ${colors.accent} 60%, transparent)`,
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
  themeOrb: {
    alignItems: "center",
    backgroundColor: colors.canvas,
    borderColor: colors.surfaceRaisedBorder,
    borderRadius: "50%",
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    height: "2.75rem",
    justifyContent: "center",
    padding: "0.125rem",
    width: "2.75rem",
  },
  themeOrbCore: {
    backgroundColor: colors.surface,
    backgroundImage: `radial-gradient(circle at 72% 76%, color-mix(in oklab, ${colors.accent} 24%, transparent), transparent 56%), linear-gradient(145deg, ${colors.surfaceRaised}, ${colors.canvas} 76%)`,
    borderColor: `color-mix(in oklab, ${colors.foreground} 14%, transparent)`,
    borderRadius: "50%",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: `inset 0 -0.375rem 0.875rem color-mix(in oklab, ${colors.canvas} 58%, transparent)`,
    height: "100%",
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  themeOrbLiquid: {
    backgroundImage: `radial-gradient(circle at 72% 20%, color-mix(in oklab, ${colors.foreground} 64%, transparent) 0 4%, transparent 22%), linear-gradient(124deg, ${colors.reasoning}, ${colors.accent} 48%, ${colors.storageAppData})`,
    borderRadius: "48% 52% 44% 56% / 34% 40% 60% 66%",
    bottom: "-17%",
    boxShadow: `inset 0 0.325rem 0.625rem color-mix(in oklab, ${colors.foreground} 18%, transparent), 0 -0.125rem 0.5rem color-mix(in oklab, ${colors.accent} 32%, transparent)`,
    height: "73%",
    left: "-18%",
    position: "absolute",
    transform: "rotate(-9deg)",
    width: "136%",
  },
  themeOrbShine: {
    backgroundImage: `radial-gradient(ellipse, color-mix(in oklab, ${colors.foreground} 72%, transparent), transparent 68%)`,
    borderRadius: "50%",
    filter: "blur(0.35px)",
    height: "0.5rem",
    left: "0.5rem",
    opacity: 0.78,
    position: "absolute",
    top: "0.375rem",
    transform: "rotate(-28deg)",
    width: "0.875rem",
  },
  themeOrbSelected: {
    boxShadow: `0 0 0 2px ${colors.canvas}, 0 0 0 4px ${colors.accent}`,
  },
  themeLabel: {
    color: colors.muted,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    textBox: "trim-both text",
  },
  themeLabelSelected: {
    color: colors.foreground,
  },
});
