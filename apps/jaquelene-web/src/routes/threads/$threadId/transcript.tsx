import { ThreadTranscriptEntryKind, type ThreadTranscriptEntry } from "@jaquelene/domain";
import { Button } from "@jaquelene/ui";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { fetchThreadTranscript, threadTranscriptQuery } from "@/feature/thread/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";
import { EmptyState } from "@/primitive/empty-state";

export const Route = createFileRoute("/threads/$threadId/transcript")({
  loader: {
    handler: ({ context, params }) => fetchThreadTranscript(context.queryClient, params.threadId),
    staleReloadMode: "blocking",
  },
  onError: (error) => reportError("thread.transcript.load", error),
  errorComponent: TranscriptRouteError,
  component: TranscriptRoute,
});

function TranscriptHeader() {
  return (
    <ContentPane.Header>
      <Breadcrumb.Root>
        <Breadcrumb.List>
          <Breadcrumb.Item>
            <Breadcrumb.Page>Transcript</Breadcrumb.Page>
          </Breadcrumb.Item>
        </Breadcrumb.List>
      </Breadcrumb.Root>
    </ContentPane.Header>
  );
}

function entryKey(entry: ThreadTranscriptEntry) {
  if (entry.kind === ThreadTranscriptEntryKind.Instruction) {
    return `instruction:${entry.sourceKey}`;
  }

  return `message:${entry.messageId}`;
}

function entryRole(entry: ThreadTranscriptEntry) {
  if (entry.kind === ThreadTranscriptEntryKind.Instruction) {
    return "System";
  }

  if (entry.author === "user") {
    return "User";
  }

  return "Assistant";
}

function TranscriptRouteError() {
  const router = useRouter();

  return (
    <>
      <TranscriptHeader />

      <ContentPane.Viewport>
        <ContentPane.Body>
          <EmptyState.Root>
            <EmptyState.Title>Couldn't load transcript</EmptyState.Title>
            <EmptyState.Description>The current model input is unavailable.</EmptyState.Description>
            <Button onClick={() => void router.invalidate()}>Retry</Button>
          </EmptyState.Root>
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

function TranscriptEntries({ entries }: { entries: readonly ThreadTranscriptEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState.Root>
        <EmptyState.Title>Empty transcript</EmptyState.Title>
        <EmptyState.Description>This thread has no model input yet.</EmptyState.Description>
      </EmptyState.Root>
    );
  }

  return (
    <ol aria-label="Model input" {...stylex.props(styles.entries)}>
      {entries.map((entry) => (
        <li key={entryKey(entry)} {...stylex.props(styles.entry)}>
          <span {...stylex.props(styles.role)}>{entryRole(entry)}</span>
          <pre {...stylex.props(styles.content)}>{entry.content}</pre>
        </li>
      ))}
    </ol>
  );
}

function TranscriptRoute() {
  const { threadId } = Route.useParams();
  const { data: transcript } = useSuspenseQuery(threadTranscriptQuery(threadId));

  return (
    <>
      <TranscriptHeader />

      <ContentPane.Viewport>
        <ContentPane.Body>
          <TranscriptEntries entries={transcript.entries} />
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  entries: {
    display: "grid",
    gap: "1.5rem",
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  entry: {
    display: "grid",
    gap: "0.5rem",
  },
  role: {
    color: colors.foregroundSecondary,
    fontSize: tokens.fontSizeXXSmall,
    fontWeight: 600,
    letterSpacing: "0.06em",
    lineHeight: tokens.lineHeightXXSmall,
    textTransform: "uppercase",
  },
  content: {
    fontFamily: tokens.fontMono,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightBase,
    margin: 0,
    minWidth: 0,
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
  },
});
