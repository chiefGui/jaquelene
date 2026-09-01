import Brain01Icon from "@hugeicons/core-free-icons/Brain01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { ReasoningEffort, type ModelReasoningCapability } from "@jaquelene/ipc/renderer";
import { Select } from "@jaquelene/ui/select";
import * as stylex from "@stylexjs/stylex";

const resetValue = "model-settings";

const effortLabels: Readonly<Record<ReasoningEffort, string>> = {
  [ReasoningEffort.Max]: "Max",
  [ReasoningEffort.XHigh]: "Extra high",
  [ReasoningEffort.High]: "High",
  [ReasoningEffort.Medium]: "Medium",
  [ReasoningEffort.Low]: "Low",
  [ReasoningEffort.Minimal]: "Minimal",
  [ReasoningEffort.None]: "Off",
};

export function ModelEffortPicker({
  capability,
  disabled,
  onValueChange,
  value,
}: {
  capability: ModelReasoningCapability | undefined;
  disabled: boolean;
  onValueChange: (value: ReasoningEffort | null) => void;
  value: ReasoningEffort | null;
}) {
  const efforts = capability?.supportedEfforts ?? [];
  const defaultEffort = capability?.defaultEffort;

  if (efforts.length === 0 && value === null) {
    return null;
  }

  const selectedEffort = value ?? defaultEffort;

  if (selectedEffort === undefined) {
    return null;
  }

  const selectedLabel = effortLabels[selectedEffort];
  const valueUnavailable = value !== null && !efforts.includes(value);

  return (
    <Select.Root
      selectedValue={selectedEffort}
      setSelectedValue={(nextValue) => {
        if (nextValue === resetValue) {
          if (value !== null) {
            onValueChange(null);
          }
          return;
        }

        const effort = efforts.find((candidate) => candidate === nextValue);

        if (!effort) {
          throw new TypeError(`Unknown model reasoning effort "${nextValue}".`);
        }

        const nextOverride = effort === defaultEffort ? null : effort;

        if (nextOverride !== value) {
          onValueChange(nextOverride);
        }
      }}
    >
      <Select
        type="button"
        variant="ghost"
        aria-label={`Reasoning effort: ${selectedLabel}`}
        disabled={disabled}
        style={styles.trigger}
      >
        <span {...stylex.props(styles.value)}>
          <HugeiconsIcon icon={Brain01Icon} size={14} strokeWidth={1.5} aria-hidden="true" />
          <Select.Value>{selectedLabel}</Select.Value>
        </span>
      </Select>

      <Select.Content aria-label="Reasoning effort">
        {valueUnavailable ? (
          <Select.Item value={value} disabled>
            <Select.ItemText>{selectedLabel} · unavailable</Select.ItemText>
            <Select.Indicator />
          </Select.Item>
        ) : null}

        {valueUnavailable && defaultEffort === undefined ? (
          <Select.Item value={resetValue}>
            <Select.ItemText>Use model settings</Select.ItemText>
            <Select.Indicator />
          </Select.Item>
        ) : null}

        {efforts.map((effort) => (
          <Select.Item key={effort} value={effort}>
            <Select.ItemText>{effortLabels[effort]}</Select.ItemText>
            <Select.Indicator />
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
}

const styles = stylex.create({
  trigger: {
    minWidth: "7rem",
  },
  value: {
    alignItems: "center",
    display: "inline-flex",
    gap: "0.5rem",
    minWidth: 0,
  },
});
