import type {
  ModelConfigurationSelection,
  RequestedModelConfiguration,
} from "@jaquelene/ipc/renderer";
import { Button } from "@jaquelene/ui";
import { colors, radii, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useQueryClient, useSuspenseInfiniteQuery } from "@tanstack/react-query";
import {
  memo,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type SubmitEvent,
} from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { Composer } from "@/feature/composer/composer";
import {
  retainLoadedThreadMessages,
  threadMessagesQuery,
  useIsTurnOperationPending,
  usePendingTurnSubmission,
  useRegenerateReply,
  useReturnToLatestThreadMessages,
  useRetryTurn,
  useSubmitTurn,
} from "./query";
import { isLatestThreadHistory } from "./thread-query-cache";
import { threadLayout } from "./thread-layout.stylex";
import { ThreadTimeline } from "./thread-timeline";
import { deriveThreadViewState } from "./thread-view-state";

type RetryStatus = "pending" | "failed" | null;

function toRequestedModelConfiguration(
  configuration: ModelConfigurationSelection,
): RequestedModelConfiguration {
  const requested: {
    model: RequestedModelConfiguration["model"];
    reasoningPreset?: NonNullable<RequestedModelConfiguration["reasoningPreset"]>;
  } = {
    model: {
      providerId: configuration.model.providerId,
      modelId: configuration.model.modelId,
    },
  };

  if (configuration.reasoningPreset !== undefined) {
    requested.reasoningPreset = configuration.reasoningPreset;
  }

  return requested;
}

function scrollToEnd(viewport: HTMLElement) {
  viewport.scrollTop = viewport.scrollHeight;
}

function isScrolledToEnd(viewport: HTMLElement) {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 1;
}

type ThreadControlsLayerProps = Readonly<{
  children: ReactNode;
  onHeightChange: (height: number) => void;
}>;

function ThreadControlsLayer({ children, onHeightChange }: ThreadControlsLayerProps) {
  const layer = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = layer.current;

    if (!element) {
      return;
    }

    const updateHeight = (height: number) => {
      onHeightChange(Math.ceil(height));
    };

    updateHeight(element.offsetHeight);
    const resizeObserver = new ResizeObserver(([entry]) => {
      updateHeight(entry?.borderBoxSize[0]?.blockSize ?? element.offsetHeight);
    });
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, [onHeightChange]);

  return (
    <div {...stylex.props(styles.controlsAnchor)}>
      <div
        ref={layer}
        {...stylex.props(threadLayout.column, threadLayout.gutter, styles.controlsLayer)}
      >
        {children}
      </div>
    </div>
  );
}

type ThreadHistoryControlsProps = Readonly<{
  hasNewerMessages: boolean;
  loadingNewerMessages: boolean;
  newerMessagesFailed: boolean;
  returnToLatestFailed: boolean;
  returningToLatest: boolean;
  navigationPending: boolean;
  loadNewer: () => Promise<void>;
  returnToLatest: () => Promise<void>;
}>;

const ThreadHistoryControls = memo(function ThreadHistoryControls({
  hasNewerMessages,
  loadingNewerMessages,
  newerMessagesFailed,
  returnToLatestFailed,
  returningToLatest,
  navigationPending,
  loadNewer,
  returnToLatest,
}: ThreadHistoryControlsProps) {
  return (
    <>
      <div {...stylex.props(styles.historyControls)}>
        <p {...stylex.props(styles.historyDescription)}>Viewing message history.</p>
        <div {...stylex.props(styles.historyActions)}>
          {hasNewerMessages ? (
            <Button
              type="button"
              variant="ghost"
              style={styles.loadNewerAction}
              disabled={navigationPending}
              onClick={() => void loadNewer()}
            >
              {loadingNewerMessages ? "Loading…" : "Load newer messages"}
            </Button>
          ) : null}
          <Button
            type="button"
            style={styles.returnToLatestAction}
            disabled={navigationPending}
            onClick={() => void returnToLatest()}
          >
            {returningToLatest ? "Returning…" : "Return to latest"}
          </Button>
        </div>
      </div>
      {newerMessagesFailed || returnToLatestFailed ? (
        <p role="alert" {...stylex.props(styles.historyError)}>
          {newerMessagesFailed
            ? "Could not load newer messages."
            : "Could not return to the latest messages."}
        </p>
      ) : null}
    </>
  );
});

type ThreadComposerProps = Readonly<{
  threadId: string;
  configuration: ModelConfigurationSelection | null;
  configurationPending: boolean;
  operationPending: boolean;
  messageMaxCodeUnits: number;
  composerControls: ReactNode;
}>;

const ThreadComposer = memo(function ThreadComposer({
  threadId,
  configuration,
  configurationPending,
  operationPending,
  messageMaxCodeUnits,
  composerControls,
}: ThreadComposerProps) {
  const submitTurnMutation = useSubmitTurn(threadId);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const acceptingSubmission = useRef(false);
  const draftRevision = useRef(0);
  const composerInputId = useId();
  const sendErrorId = useId();
  const submissionBlocked = operationPending || configurationPending;

  async function sendMessage(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submissionBlocked || acceptingSubmission.current || !configuration) {
      return;
    }

    const content = draft;

    if (!content.trim()) {
      return;
    }

    setSendError(null);
    const submittedRevision = draftRevision.current;
    setDraft("");
    acceptingSubmission.current = true;

    try {
      await submitTurnMutation.mutateAsync({
        clientId: crypto.randomUUID(),
        content,
        submittedAt: Date.now(),
        configuration: toRequestedModelConfiguration(configuration),
      });
    } catch (cause) {
      setDraft((currentDraft) =>
        draftRevision.current === submittedRevision ? content : currentDraft,
      );
      reportError("thread.turn.submit", cause);
      setSendError("Could not send the message.");
    } finally {
      acceptingSubmission.current = false;
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <Composer pending={operationPending} onSubmit={sendMessage}>
      <Composer.Label htmlFor={composerInputId}>Message</Composer.Label>
      <Composer.Input
        id={composerInputId}
        value={draft}
        maxLength={messageMaxCodeUnits}
        aria-describedby={sendError ? sendErrorId : undefined}
        onChange={(event) => {
          draftRevision.current += 1;
          setDraft(event.currentTarget.value);
          setSendError(null);
        }}
        onKeyDown={handleComposerKeyDown}
      />
      <Composer.Footer>
        <Composer.Controls>
          {composerControls}
          {sendError ? (
            <Composer.Status id={sendErrorId} role="alert" tone="danger">
              {sendError}
            </Composer.Status>
          ) : null}
        </Composer.Controls>
        <Composer.Submit
          pending={operationPending}
          disabled={configurationPending || !configuration || !draft.trim()}
        />
      </Composer.Footer>
    </Composer>
  );
});

export function ThreadView({
  threadId,
  configuration,
  configurationPending,
  composerControls,
}: {
  threadId: string;
  configuration: ModelConfigurationSelection | null;
  configurationPending: boolean;
  composerControls: ReactNode;
}) {
  const queryClient = useQueryClient();
  const messagesQuery = useSuspenseInfiniteQuery(threadMessagesQuery(threadId));
  const returnToLatestMutation = useReturnToLatestThreadMessages(threadId);
  const returnToLatestMessages = returnToLatestMutation.mutateAsync;
  const retryTurnMutation = useRetryTurn(threadId);
  const retryTurn = retryTurnMutation.mutateAsync;
  const resetRetry = retryTurnMutation.reset;
  const regenerateReplyMutation = useRegenerateReply(threadId);
  const regenerateReply = regenerateReplyMutation.mutateAsync;
  const resetRegeneration = regenerateReplyMutation.reset;
  const acceptingRetry = useRef(false);
  const acceptingRegeneration = useRef(false);
  const historyNavigation = useRef<"older" | "newer" | "latest" | null>(null);
  const turnOperationPending = useIsTurnOperationPending(threadId);
  const pendingSubmission = usePendingTurnSubmission(threadId);
  const viewport = useRef<HTMLDivElement>(null);
  const pinnedToEnd = useRef(true);
  const [timelineBottomInset, setTimelineBottomInset] = useState(0);
  const retryTurnId = retryTurnMutation.variables?.turnId;
  const retryStatus: RetryStatus = retryTurnMutation.isPending
    ? "pending"
    : retryTurnMutation.isError
      ? "failed"
      : null;
  const historical = !isLatestThreadHistory(messagesQuery.data);
  const threadView = useMemo(
    () =>
      deriveThreadViewState({
        pages: messagesQuery.data.pages,
        retryActivity:
          retryTurnId && retryStatus ? { turnId: retryTurnId, status: retryStatus } : null,
        actionsAvailable: !historical,
        hasModel: configuration !== null,
      }),
    [configuration, historical, messagesQuery.data.pages, retryStatus, retryTurnId],
  );
  const operationPending = turnOperationPending || (!historical && threadView.replyPending);

  const retryReply = useCallback(
    async (turnId: string) => {
      if (
        historical ||
        operationPending ||
        !configuration ||
        configurationPending ||
        acceptingRetry.current
      ) {
        return;
      }

      acceptingRetry.current = true;
      resetRetry();

      try {
        await retryTurn({
          turnId,
          configuration: toRequestedModelConfiguration(configuration),
        });
      } catch (cause) {
        reportError("thread.turn.retry", cause);
      } finally {
        acceptingRetry.current = false;
      }
    },
    [configuration, configurationPending, historical, operationPending, resetRetry, retryTurn],
  );

  const regenerateResponse = useCallback(
    async (assistantMessageId: string) => {
      if (
        historical ||
        operationPending ||
        !configuration ||
        configurationPending ||
        acceptingRegeneration.current
      ) {
        return false;
      }

      acceptingRegeneration.current = true;
      resetRegeneration();

      try {
        await regenerateReply({
          assistantMessageId,
          configuration: toRequestedModelConfiguration(configuration),
        });
        return true;
      } catch (cause) {
        reportError("thread.reply.regenerate", cause);
        return false;
      } finally {
        acceptingRegeneration.current = false;
      }
    },
    [
      configuration,
      configurationPending,
      historical,
      operationPending,
      regenerateReply,
      resetRegeneration,
    ],
  );

  const loadOlder = useCallback(async () => {
    if (historyNavigation.current || operationPending) {
      return;
    }

    historyNavigation.current = "older";

    try {
      const result = await messagesQuery.fetchNextPage({ cancelRefetch: false });

      if (result.isError) {
        reportError("thread.messages.load-older", result.error);
        return;
      }

      retainLoadedThreadMessages(queryClient, threadId, "older");
    } catch (cause) {
      reportError("thread.messages.load-older", cause);
    } finally {
      historyNavigation.current = null;
    }
  }, [messagesQuery.fetchNextPage, operationPending, queryClient, threadId]);
  const loadNewer = useCallback(async () => {
    if (historyNavigation.current || operationPending) {
      return;
    }

    historyNavigation.current = "newer";

    try {
      const result = await messagesQuery.fetchPreviousPage({ cancelRefetch: false });

      if (result.isError) {
        reportError("thread.messages.load-newer", result.error);
        return;
      }

      retainLoadedThreadMessages(queryClient, threadId, "newer");
    } catch (cause) {
      reportError("thread.messages.load-newer", cause);
    } finally {
      historyNavigation.current = null;
    }
  }, [messagesQuery.fetchPreviousPage, operationPending, queryClient, threadId]);
  const returnToLatest = useCallback(async () => {
    if (historyNavigation.current || operationPending) {
      return;
    }

    historyNavigation.current = "latest";
    const wasPinnedToEnd = pinnedToEnd.current;
    pinnedToEnd.current = true;

    try {
      await returnToLatestMessages();
    } catch (cause) {
      pinnedToEnd.current = wasPinnedToEnd;
      reportError("thread.messages.return-to-latest", cause);
    } finally {
      historyNavigation.current = null;
    }
  }, [operationPending, returnToLatestMessages]);
  const historyNavigationPending =
    operationPending ||
    messagesQuery.isFetchingNextPage ||
    messagesQuery.isFetchingPreviousPage ||
    returnToLatestMutation.isPending;
  const retryPending = operationPending || configurationPending || historyNavigationPending;

  useLayoutEffect(() => {
    const element = viewport.current;

    if (element && pinnedToEnd.current) {
      scrollToEnd(element);
    }
  }, [timelineBottomInset]);

  return (
    <section aria-label="Thread" {...stylex.props(styles.root)}>
      <div
        ref={viewport}
        onScroll={(event) => {
          pinnedToEnd.current = isScrolledToEnd(event.currentTarget);
        }}
        {...stylex.props(styles.viewport)}
      >
        <ThreadTimeline
          key={`timeline:${threadId}`}
          view={threadView}
          pendingSubmission={historical ? null : pendingSubmission}
          bottomInset={timelineBottomInset}
          viewport={viewport}
          pinnedToEnd={pinnedToEnd}
          latestHistory={!historical}
          hasOlderMessages={messagesQuery.hasNextPage}
          loadingOlderMessages={messagesQuery.isFetchingNextPage}
          olderMessagesFailed={messagesQuery.isFetchNextPageError}
          historyNavigationPending={historyNavigationPending}
          retryPending={retryPending}
          regenerationRequestPending={regenerateReplyMutation.isPending}
          responseActionsDisabled={
            operationPending || configurationPending || historyNavigationPending
          }
          loadOlder={loadOlder}
          regenerateResponse={regenerateResponse}
          retryReply={retryReply}
        />
        <ThreadControlsLayer onHeightChange={setTimelineBottomInset}>
          {historical ? (
            <ThreadHistoryControls
              hasNewerMessages={messagesQuery.hasPreviousPage}
              loadingNewerMessages={messagesQuery.isFetchingPreviousPage}
              newerMessagesFailed={messagesQuery.isFetchPreviousPageError}
              returnToLatestFailed={returnToLatestMutation.isError}
              returningToLatest={returnToLatestMutation.isPending}
              navigationPending={historyNavigationPending}
              loadNewer={loadNewer}
              returnToLatest={returnToLatest}
            />
          ) : (
            <ThreadComposer
              key={`composer:${threadId}`}
              threadId={threadId}
              configuration={configuration}
              configurationPending={configurationPending}
              operationPending={operationPending}
              messageMaxCodeUnits={threadView.messageMaxCodeUnits}
              composerControls={composerControls}
            />
          )}
        </ThreadControlsLayer>
      </div>
    </section>
  );
}

const styles = stylex.create({
  root: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
  },
  viewport: {
    flex: 1,
    minHeight: 0,
    overflowAnchor: "none",
    overflowY: "auto",
    scrollbarGutter: "stable",
  },
  controlsAnchor: {
    bottom: 0,
    height: 0,
    position: "sticky",
    zIndex: 1,
  },
  controlsLayer: {
    bottom: 0,
    left: 0,
    paddingBlock: "0 1.5rem",
    position: "absolute",
    right: 0,
  },
  historyControls: {
    alignItems: "center",
    backgroundColor: colors.backgroundSurfaceOverlay,
    borderColor: colors.borderDefault,
    borderRadius: radii.content,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexWrap: "wrap",
    gap: "1rem",
    justifyContent: "space-between",
    padding: "0.75rem",
  },
  historyDescription: {
    color: colors.foregroundSecondary,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
  },
  historyActions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    flexShrink: 0,
    gap: "0.5rem",
    justifyContent: "flex-end",
    marginInlineStart: "auto",
  },
  loadNewerAction: {
    minWidth: "9.75rem",
  },
  returnToLatestAction: {
    minWidth: "7.75rem",
  },
  historyError: {
    color: colors.foregroundDanger,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    marginTop: "0.375rem",
  },
});
