import { Item } from "@jaquelene/ui";
import { Select } from "@jaquelene/ui/select";
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
} from "@/feature/appearance/user-interface/query";
import { interfaceScales } from "@/feature/appearance/user-interface/scale";
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
          <Item.Description id={errorId} role="alert" className="text-danger">
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
            className="min-w-32"
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

function AppearanceRoute() {
  const { data: preferences } = useSuspenseQuery(userInterfacePreferencesQuery);
  const setInterfaceScale = useSetInterfaceScale();
  const setMotion = useSetMotion();
  const setUiFont = useSetUiFont();

  return (
    <>
      <ContentPane.Header>
        <Breadcrumb.Root className="min-w-0 text-sm">
          <Breadcrumb.List className="flex min-w-0 items-center gap-2">
            <Breadcrumb.Item className="text-muted">Settings</Breadcrumb.Item>
            <Breadcrumb.Separator className="text-muted" />
            <Breadcrumb.Item>
              <Breadcrumb.Page className="font-medium text-foreground">Appearance</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <div className="mx-auto w-full max-w-2xl p-6">
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
            </Item.Group>
          </Item.Section>
        </div>
      </ContentPane.Viewport>
    </>
  );
}
