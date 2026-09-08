import { Item } from "@jaquelene/ui";
import { Select } from "@jaquelene/ui/select";
import { colors } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useId } from "react";

export function PreferenceSelectItem<Value extends string>({
  description,
  disabled,
  error,
  label,
  onValueChange,
  options,
  selectStyle,
  value,
}: {
  description?: string;
  disabled: boolean;
  error: string | null;
  label: string;
  onValueChange: (value: Value) => void;
  options: readonly { label: string; value: Value }[];
  selectStyle?: stylex.StyleXStyles;
  value: Value;
}) {
  const controlId = useId();
  const errorId = useId();
  const labelId = useId();
  const descriptionId = useId();
  const selectedOption = options.find((option) => option.value === value);
  if (!selectedOption) {
    throw new TypeError(`Unknown preference value "${value}".`);
  }
  const descriptionIds: string[] = [];
  if (description) {
    descriptionIds.push(descriptionId);
  }
  if (error) {
    descriptionIds.push(errorId);
  }

  return (
    <Item.Root>
      <Item.Content>
        <Item.Label id={labelId} render={<label htmlFor={controlId} />}>
          {label}
        </Item.Label>
        {description && <Item.Description id={descriptionId}>{description}</Item.Description>}
        {error && (
          <Item.Description id={errorId} role="alert" style={styles.error}>
            {error}
          </Item.Description>
        )}
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
            aria-describedby={descriptionIds.join(" ") || undefined}
            disabled={disabled}
            style={[styles.select, selectStyle]}
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

const styles = stylex.create({
  error: { color: colors.foregroundDanger },
  select: { minWidth: "8rem" },
});
