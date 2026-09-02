import {
  ComboboxItem,
  ComboboxItemCheck,
  ComboboxList,
  ComboboxPopover,
  useComboboxContext,
} from "@ariakit/react/combobox";
import { useStoreState } from "@ariakit/react/store";
import { Button, ControlIcon } from "@jaquelene/ui";
import { Popover } from "@jaquelene/ui/popover";
import { Select } from "@jaquelene/ui/select";
import { colors, radii, shadows, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useId, useState, type ReactElement } from "react";

const descriptionMaxLength = 180;

export type PromptSelectOption = Readonly<{
  description: string;
  title: string;
  value: string;
}>;

type PromptSelectFooterAction = Readonly<{
  label: string;
  render: ReactElement;
}>;

type PromptSelectProps = {
  "aria-describedby"?: string;
  "aria-labelledby": string;
  busy?: boolean;
  disabled?: boolean;
  footerAction?: PromptSelectFooterAction;
  hasMore?: boolean;
  id: string;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onValueChange: (value: string) => void;
  options: readonly PromptSelectOption[];
  value: string;
};

function summarizeDescription(description: string) {
  const normalized = description.replace(/\s+/gu, " ").trim();

  if (normalized.length <= descriptionMaxLength) {
    return normalized;
  }

  let end = descriptionMaxLength - 1;
  const lastCodeUnit = normalized.charCodeAt(end - 1);

  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) {
    end -= 1;
  }

  return `${normalized.slice(0, end).trimEnd()}…`;
}

function PromptOption({ option }: { option: PromptSelectOption }) {
  const descriptionId = useId();

  return (
    <ComboboxItem
      value={option.value}
      typeaheadText={option.title}
      hideOnClick={false}
      aria-label={option.title}
      aria-describedby={descriptionId}
      {...stylex.props(styles.option, stylex.defaultMarker())}
    >
      <ComboboxItemCheck {...stylex.props(styles.selectedIndicator)}>
        <ControlIcon.Check style={styles.selectedIcon} />
      </ComboboxItemCheck>

      <span {...stylex.props(styles.optionText)}>
        <span {...stylex.props(styles.optionTitle)}>{option.title}</span>
        <span id={descriptionId} {...stylex.props(styles.optionDescription)}>
          {summarizeDescription(option.description)}
        </span>
      </span>
    </ComboboxItem>
  );
}

function PromptSelectContent({
  footerAction,
  hasMore,
  labelledBy,
  loadingMore,
  onLoadMore,
  options,
}: {
  footerAction: PromptSelectFooterAction | undefined;
  hasMore: boolean;
  labelledBy: string;
  loadingMore: boolean;
  onLoadMore: (() => void) | undefined;
  options: readonly PromptSelectOption[];
}) {
  const combobox = useComboboxContext();
  const mounted = useStoreState(combobox, "mounted") ?? false;

  return (
    <Popover.Presence present={mounted}>
      <ComboboxPopover
        portal
        gutter={8}
        alwaysVisible
        aria-labelledby={labelledBy}
        render={<Popover.Surface />}
        role="dialog"
        {...stylex.props(styles.content)}
      >
        <ComboboxList alwaysVisible aria-labelledby={labelledBy} {...stylex.props(styles.options)}>
          {options.map((option) => (
            <PromptOption key={option.value} option={option} />
          ))}
        </ComboboxList>

        {hasMore || footerAction ? (
          <div {...stylex.props(styles.footer)}>
            {hasMore ? (
              <Button
                type="button"
                variant="ghost"
                disabled={loadingMore}
                onClick={onLoadMore}
                style={styles.footerAction}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            ) : null}
            {footerAction ? (
              <Button
                variant="ghost"
                render={footerAction.render}
                onClick={() => combobox?.setOpen(false)}
                style={styles.footerAction}
              >
                <Button.Label>{footerAction.label}</Button.Label>
                <ControlIcon.Chevron style={styles.footerActionIcon} />
              </Button>
            ) : null}
          </div>
        ) : null}
      </ComboboxPopover>
    </Popover.Presence>
  );
}

export function PromptSelect({
  "aria-describedby": ariaDescribedBy,
  "aria-labelledby": ariaLabelledBy,
  busy = false,
  disabled = false,
  footerAction,
  hasMore = false,
  id,
  loadingMore = false,
  onLoadMore,
  onValueChange,
  options,
  value,
}: PromptSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value);

  if (!selectedOption) {
    throw new Error(`PromptSelect value "${value}" is unavailable.`);
  }

  return (
    <Select.Root
      open={open}
      setOpen={setOpen}
      selectedValue={value}
      setSelectedValue={(nextValue) => {
        const option = options.find((candidate) => candidate.value === nextValue);

        if (!option) {
          throw new TypeError(`Unknown prompt selection "${nextValue}".`);
        }

        setOpen(false);

        if (nextValue !== value) {
          onValueChange(nextValue);
        }
      }}
    >
      <Select
        id={id}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-busy={busy || undefined}
        aria-haspopup="dialog"
        disabled={disabled || busy}
        style={styles.trigger}
      >
        <Select.Value style={styles.triggerValue}>{selectedOption.title}</Select.Value>
      </Select>

      <PromptSelectContent
        footerAction={footerAction}
        hasMore={hasMore}
        labelledBy={ariaLabelledBy}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        options={options}
      />
    </Select.Root>
  );
}

const activeBackground = colors.backgroundInteractive;

const styles = stylex.create({
  trigger: {
    justifySelf: "end",
    maxWidth: "12rem",
    minWidth: 0,
    width: "fit-content",
  },
  triggerValue: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  content: {
    backgroundColor: colors.backgroundSurfaceOverlay,
    borderColor: colors.borderOverlay,
    borderRadius: radii.surface,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: shadows.floating,
    color: colors.foregroundPrimary,
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    maxHeight: "24rem",
    maxWidth: "calc(100vw - 2rem)",
    outline: "none",
    overflow: "hidden",
    padding: "0.25rem",
    width: "20rem",
    zIndex: 50,
  },
  options: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    minHeight: 0,
    overflowY: "auto",
  },
  option: {
    alignItems: "flex-start",
    backgroundColor: {
      default: "transparent",
      ":focus": activeBackground,
      ":hover": activeBackground,
      ":is([data-active-item])": activeBackground,
      ':is([aria-selected="true"])': colors.backgroundSelected,
      ':is([aria-selected="true"]):focus': colors.backgroundSelectedHover,
      ':is([aria-selected="true"]):hover': colors.backgroundSelectedHover,
    },
    borderRadius: radii.compact,
    color: colors.foregroundPrimary,
    display: "grid",
    gap: "0.5rem",
    gridTemplateColumns: "1rem minmax(0, 1fr)",
    minWidth: 0,
    outline: "none",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
    textAlign: "start",
  },
  selectedIndicator: {
    color: colors.foregroundAccent,
    gridColumnStart: "1",
    gridRowStart: "1",
    marginTop: "0.125rem",
  },
  selectedIcon: { height: "0.875rem", width: "0.875rem" },
  optionText: {
    display: "block",
    gridColumnStart: "2",
    gridRowStart: "1",
    minWidth: 0,
  },
  optionTitle: {
    display: "block",
    fontSize: tokens.fontSizeSmall,
    fontWeight: 500,
    lineHeight: tokens.lineHeightSmall,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  optionDescription: {
    color: {
      default: colors.foregroundSecondary,
      [stylex.when.ancestor('[aria-selected="true"]')]: colors.foregroundPrimary,
    },
    display: "-webkit-box",
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    marginTop: "0.125rem",
    overflow: "hidden",
    overflowWrap: "anywhere",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  footer: {
    borderBlockStartColor: colors.borderOverlay,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: 1,
    display: "grid",
    flexShrink: 0,
    gap: "0.25rem",
    marginInline: "-0.25rem",
    paddingBlockStart: "0.25rem",
    paddingInline: "0.25rem",
  },
  footerAction: { justifyContent: "space-between", width: "100%" },
  footerActionIcon: { height: "0.75rem", width: "0.75rem" },
});
