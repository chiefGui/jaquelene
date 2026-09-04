import { ThreadTranscriptEntryKind, type ThreadTranscriptEntry } from "@jaquelene/domain";
import { Button } from "@jaquelene/ui";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { campaignQuery } from "@/feature/campaign/query";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { loadThreadTranscript } from "@/feature/thread/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";
import { EmptyState } from "@/primitive/empty-state";

export const Route = createFileRoute("/campaigns/$campaignId_/transcript")({
  preload: false,
  staleTime: 0,
  loader: {
    async handler({ context, params }) {
      const campaign = await context.queryClient.query({
        ...campaignQuery(params.campaignId),
        staleTime: "static",
      });

      if (!campaign) {
        return null;
      }

      const transcript = await loadThreadTranscript(campaign.threadId);
      return { campaign, transcript };
    },
    staleReloadMode: "blocking",
  },
  onError: (error) => reportError("campaign.transcript.load", error),
  errorComponent: TranscriptRouteError,
  component: TranscriptRoute,
});

function TranscriptHeader({
  campaignId,
  campaignTitle,
}: {
  campaignId: string;
  campaignTitle: string;
}) {
  const destination = {
    to: "/campaigns/$campaignId",
    params: { campaignId },
    replace: true,
  } as const;

  return (
    <ContentPane.Header>
      <ContentPane.HistoryBack fallback={destination} aria-label={`Back to ${campaignTitle}`} />

      <Breadcrumb.Root>
        <Breadcrumb.List>
          <Breadcrumb.Item>
            <Breadcrumb.Link render={<Link {...destination} />}>{campaignTitle}</Breadcrumb.Link>
          </Breadcrumb.Item>
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
  const { campaignId } = Route.useParams();

  return (
    <>
      <TranscriptHeader campaignId={campaignId} campaignTitle="Campaign" />

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
        <EmptyState.Description>This campaign has no model input yet.</EmptyState.Description>
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

function MissingCampaignRoute() {
  return (
    <>
      <ContentPane.Header>
        <ContentPane.HistoryBack
          fallback={{ to: "/campaigns/new", replace: true }}
          aria-label="Back to campaigns"
        />

        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>
              <Breadcrumb.Page>Transcript</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <ContentPane.Body>
          <EmptyState.Root>
            <EmptyState.Title>Campaign not found</EmptyState.Title>
            <EmptyState.Description>It may have been deleted.</EmptyState.Description>
          </EmptyState.Root>
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

function TranscriptRoute() {
  const data = Route.useLoaderData();

  if (!data) {
    return <MissingCampaignRoute />;
  }

  return (
    <>
      <TranscriptHeader campaignId={data.campaign.id} campaignTitle={data.campaign.title} />

      <ContentPane.Viewport>
        <ContentPane.Body>
          <TranscriptEntries entries={data.transcript.entries} />
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
