import Brain01Icon from "@hugeicons/core-free-icons/Brain01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { ReasoningPreset, type ModelReasoningCapability } from "@jaquelene/ipc/renderer";
import { Select } from "@jaquelene/ui/select";
import * as stylex from "@stylexjs/stylex";

const resetValue = "reset-to-model-reasoning";

const presetLabels: Readonly<Record<ReasoningPreset, string>> = {
  [ReasoningPreset.Automatic]: "Automatic",
  [ReasoningPreset.On]: "On",
  [ReasoningPreset.Off]: "Off",
  [ReasoningPreset.Minimal]: "Minimal",
  [ReasoningPreset.Low]: "Low",
  [ReasoningPreset.Medium]: "Medium",
  [ReasoningPreset.High]: "High",
  [ReasoningPreset.XHigh]: "Extra high",
  [ReasoningPreset.Max]: "Max",
};

export function ModelReasoningPicker({
  busy,
  capability,
  disabled,
  onValueChange,
  value,
}: {
  busy: boolean;
  capability: ModelReasoningCapability | undefined;
  disabled: boolean;
  onValueChange: (value: ReasoningPreset | null) => void;
  value: ReasoningPreset | null;
}) {
  const presets = capability?.supportedPresets ?? [];
  const defaultPreset = capability?.defaultPreset;
  const valueUnavailable = value !== null && !presets.includes(value);

  if (!valueUnavailable && presets.length <= 1) {
    return null;
  }

  const selectedPreset = value ?? defaultPreset;

  if (selectedPreset === undefined) {
    return null;
  }

  const selectedLabel = presetLabels[selectedPreset];

  return (
    <Select.Root
      selectedValue={selectedPreset}
      setSelectedValue={(nextValue) => {
        if (nextValue === resetValue) {
          if (value !== null) {
            onValueChange(null);
          }
          return;
        }

        const preset = presets.find((candidate) => candidate === nextValue);

        if (!preset) {
          throw new TypeError(`Unknown model reasoning preset "${nextValue}".`);
        }

        if (preset !== selectedPreset) {
          onValueChange(preset);
        }
      }}
    >
      <Select
        type="button"
        variant="ghost"
        aria-label={`Reasoning: ${selectedLabel}`}
        aria-busy={busy || undefined}
        disabled={disabled}
        style={styles.trigger}
      >
        <span {...stylex.props(styles.value)}>
          <HugeiconsIcon icon={Brain01Icon} size={14} strokeWidth={1.5} aria-hidden="true" />
          <Select.Value>{selectedLabel}</Select.Value>
        </span>
      </Select>

      <Select.Content aria-label="Reasoning" width="content">
        {valueUnavailable ? (
          <Select.Item value={value} disabled>
            <Select.ItemText>{selectedLabel} · unavailable</Select.ItemText>
            <Select.Indicator />
          </Select.Item>
        ) : null}

        {valueUnavailable && !capability ? (
          <Select.Item value={resetValue}>
            <Select.ItemText>Clear reasoning setting</Select.ItemText>
            <Select.Indicator />
          </Select.Item>
        ) : null}

        {presets.map((preset) => (
          <Select.Item key={preset} value={preset}>
            <Select.ItemText>{presetLabels[preset]}</Select.ItemText>
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
