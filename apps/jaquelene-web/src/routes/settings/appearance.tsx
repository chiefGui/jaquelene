import { Item } from "@jaquelene/ui";
import { Select } from "@jaquelene/ui/select";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useId } from "react";
import { uiFonts } from "@/feature/appearance/user-interface/font";
import {
  userInterfacePreferencesQuery,
  useSetInterfaceScale,
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

type PreferenceSelectProps<Value extends string> = {
  disabled: boolean;
  labelId: string;
  onValueChange: (value: Value) => void;
  options: readonly PreferenceOption<Value>[];
  value: Value;
};

function PreferenceSelect<Value extends string>({
  disabled,
  labelId,
  onValueChange,
  options,
  value,
}: PreferenceSelectProps<Value>) {
  const valueId = useId();
  const selectedOption = options.find((option) => option.value === value);

  if (!selectedOption) {
    throw new TypeError(`Unknown preference value "${value}".`);
  }

  return (
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
      <Select aria-labelledby={`${labelId} ${valueId}`} disabled={disabled} className="min-w-32">
        <Select.Value id={valueId}>{selectedOption.label}</Select.Value>
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
  );
}

function AppearanceRoute() {
  const { data: preferences } = useSuspenseQuery(userInterfacePreferencesQuery);
  const setInterfaceScale = useSetInterfaceScale();
  const setUiFont = useSetUiFont();
  const fontLabelId = useId();
  const interfaceScaleLabelId = useId();

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
              <Item.Root>
                <Item.Content>
                  <Item.Label id={fontLabelId}>Font</Item.Label>
                  {setUiFont.isError ? (
                    <Item.Description role="alert" className="text-danger">
                      Couldn&apos;t save the font.
                    </Item.Description>
                  ) : null}
                </Item.Content>

                <Item.Value>
                  <PreferenceSelect
                    disabled={setUiFont.isPending}
                    labelId={fontLabelId}
                    onValueChange={setUiFont.mutate}
                    options={Object.values(uiFonts)}
                    value={preferences.font}
                  />
                </Item.Value>
              </Item.Root>

              <Item.Root>
                <Item.Content>
                  <Item.Label id={interfaceScaleLabelId}>Interface scale</Item.Label>
                  {setInterfaceScale.isError ? (
                    <Item.Description role="alert" className="text-danger">
                      Couldn&apos;t save the interface scale.
                    </Item.Description>
                  ) : null}
                </Item.Content>

                <Item.Value>
                  <PreferenceSelect
                    disabled={setInterfaceScale.isPending}
                    labelId={interfaceScaleLabelId}
                    onValueChange={setInterfaceScale.mutate}
                    options={Object.values(interfaceScales)}
                    value={preferences.scale}
                  />
                </Item.Value>
              </Item.Root>
            </Item.Group>
          </Item.Section>
        </div>
      </ContentPane.Viewport>
    </>
  );
}
