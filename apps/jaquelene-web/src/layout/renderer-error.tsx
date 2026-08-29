import { Button } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { Component, type ReactNode } from "react";

type RendererErrorBoundaryProps = {
  children: ReactNode;
};

type RendererErrorBoundaryState = {
  failed: boolean;
};

export class RendererErrorBoundary extends Component<
  RendererErrorBoundaryProps,
  RendererErrorBoundaryState
> {
  state: RendererErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): RendererErrorBoundaryState {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <RendererError /> : this.props.children;
  }
}

function RendererError() {
  return (
    <main aria-labelledby="renderer-error-heading" {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.content)}>
        <div role="alert">
          <h1 id="renderer-error-heading" {...stylex.props(styles.heading)}>
            Jaquelene couldn’t continue
          </h1>
          <p {...stylex.props(styles.description)}>Reload the app to try again.</p>
        </div>
        <Button type="button" style={styles.action} onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </main>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    backgroundColor: tokens.canvas,
    color: tokens.foreground,
    display: "flex",
    fontFamily: tokens.fontSystem,
    fontSize: tokens.fontSizeSmall,
    justifyContent: "center",
    lineHeight: tokens.lineHeightSmall,
    minHeight: "100dvh",
    padding: "2rem",
  },
  content: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    maxWidth: "24rem",
    textAlign: "center",
  },
  heading: {
    fontSize: tokens.fontSizeLarge,
    fontWeight: 600,
    lineHeight: tokens.lineHeightLarge,
  },
  description: {
    color: tokens.muted,
    marginTop: "0.5rem",
  },
  action: {
    marginTop: "1rem",
  },
});
