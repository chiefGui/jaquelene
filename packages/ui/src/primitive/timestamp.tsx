import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps } from "react";
import { formatTimestamp } from "../util/format-timestamp";

export type TimestampProps = Omit<
  ComponentProps<"time">,
  "children" | "className" | "dateTime" | "style"
> & {
  value: number;
  style?: StyleXStyles;
};

export function Timestamp({ style, value, ...props }: TimestampProps) {
  return (
    <time {...props} dateTime={new Date(value).toISOString()} {...stylex.props(style)}>
      {formatTimestamp(value)}
    </time>
  );
}
