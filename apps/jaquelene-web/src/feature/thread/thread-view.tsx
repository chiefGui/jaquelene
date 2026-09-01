import type { ModelReference } from "@jaquelene/ipc/renderer";
import { Button } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
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
  retainLoadedOlderThreadMessages,
  threadMessagesQuery,
  useIsTurnOperationPending,
  usePendingTurnSubmission,
  useReturnToLatestThreadMessages,
  useRetryTurn,
  useSubmitTurn,
} from "./query";
import { isLatestThreadHistory } from "./thread-query-cache";
import { ThreadTimeline } from "./thread-timeline";
import { deriveThreadViewState } from "./thread-view-state";

type RetryStatus = "pending" | "failed" | null;

function scrollToEnd(viewport: HTMLElement) {
  viewport.scrollTop = viewport.scrollHeight;
}

type ThreadDockProps = Readonly<{
  children: ReactNode;
  onSizeChange: (height: number) => void;
}>;

function ThreadDock({ children, onSizeChange }: ThreadDockProps) {
  const dock = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = dock.current;

    if (!element) {
      return;
    }

    const synchronizeSize = () => {
      onSizeChange(Math.ceil(element.getBoundingClientRect().height));
    };

    synchronizeSize();
    const resizeObserver = new ResizeObserver(synchronizeSize);
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, [onSizeChange]);

  return (
    <div ref={dock} {...stylex.props(styles.composerShell)}>
      {children}
    </div>
  );
}

type ThreadHistoryReturnProps = Readonly<{
  error: boolean;
  pending: boolean;
  returnToLatest: () => Promise<void>;
}>;

const ThreadHistoryReturn = memo(function ThreadHistoryReturn({
  error,
  pending,
  returnToLatest,
}: ThreadHistoryReturnProps) {
  return (
    <>
      <div {...stylex.props(styles.historyReturn)}>
        <p {...stylex.props(styles.historyDescription)}>Viewing older messages.</p>
        <Button type="button" disabled={pending} onClick={() => void returnToLatest()}>
          {pending ? "Returning…" : "Return to latest"}
        </Button>
      </div>
      {error ? (
        <p role="alert" {...stylex.props(styles.historyError)}>
          Could not return to the latest messages.
        </p>
      ) : null}
    </>
  );
});

type ThreadComposerProps = Readonly<{
  threadId: string;
  model: ModelReference | null;
  modelPending: boolean;
  operationPending: boolean;
  messageMaxCodeUnits: number;
  composerControls: ReactNode;
}>;

const ThreadComposer = memo(function ThreadComposer({
  threadId,
  model,
  modelPending,
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
  const submissionBlocked = operationPending || modelPending;

  async function sendMessage(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submissionBlocked || acceptingSubmission.current || !model) {
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
        model: { providerId: model.providerId, modelId: model.modelId },
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
          disabled={modelPending || !model || !draft.trim()}
        />
      </Composer.Footer>
    </Composer>
  );
});

export function ThreadView({
  threadId,
  model,
  modelPending,
  composerControls,
}: {
  threadId: string;
  model: ModelReference | null;
  modelPending: boolean;
  composerControls: ReactNode;
}) {
  const queryClient = useQueryClient();
  const messagesQuery = useSuspenseInfiniteQuery(threadMessagesQuery(threadId));
  const returnToLatestMutation = useReturnToLatestThreadMessages(threadId);
  const returnToLatestMessages = returnToLatestMutation.mutateAsync;
  const retryTurnMutation = useRetryTurn(threadId);
  const retryTurn = retryTurnMutation.mutateAsync;
  const resetRetry = retryTurnMutation.reset;
  const acceptingRetry = useRef(false);
  const turnOperationPending = useIsTurnOperationPending(threadId);
  const pendingSubmission = usePendingTurnSubmission(threadId);
  const viewport = useRef<HTMLDivElement>(null);
  const pinnedToEnd = useRef(true);
  const [timelineEndInset, setTimelineEndInset] = useState(0);
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
        hasModel: model !== null && !historical,
      }),
    [historical, messagesQuery.data.pages, model, retryStatus, retryTurnId],
  );
  const operationPending = turnOperationPending || (!historical && threadView.replyPending);

  const retryReply = useCallback(
    async (turnId: string) => {
      if (historical || operationPending || !model || modelPending || acceptingRetry.current) {
        return;
      }

      acceptingRetry.current = true;
      resetRetry();

      try {
        await retryTurn({
          turnId,
          model: { providerId: model.providerId, modelId: model.modelId },
        });
      } catch (cause) {
        reportError("thread.turn.retry", cause);
      } finally {
        acceptingRetry.current = false;
      }
    },
    [historical, model, modelPending, operationPending, resetRetry, retryTurn],
  );

  const loadOlder = useCallback(async () => {
    await messagesQuery.fetchNextPage();
    retainLoadedOlderThreadMessages(queryClient, threadId);
  }, [messagesQuery.fetchNextPage, queryClient, threadId]);
  const returnToLatest = useCallback(async () => {
    const wasPinnedToEnd = pinnedToEnd.current;
    pinnedToEnd.current = true;

    try {
      await returnToLatestMessages();
    } catch (cause) {
      pinnedToEnd.current = wasPinnedToEnd;
      reportError("thread.messages.return-to-latest", cause);
    }
  }, [returnToLatestMessages]);
  const retryPending = operationPending || modelPending || returnToLatestMutation.isPending;
  const historyNavigationPending = operationPending || returnToLatestMutation.isPending;

  useLayoutEffect(() => {
    const element = viewport.current;

    if (element && pinnedToEnd.current) {
      scrollToEnd(element);
    }
  }, [timelineEndInset]);

  return (
    <section aria-label="Thread" {...stylex.props(styles.root)}>
      <ThreadTimeline
        key={`timeline:${threadId}`}
        view={threadView}
        pendingSubmission={historical ? null : pendingSubmission}
        endInset={timelineEndInset}
        viewport={viewport}
        pinnedToEnd={pinnedToEnd}
        hasNextPage={messagesQuery.hasNextPage}
        isFetchingNextPage={messagesQuery.isFetchingNextPage}
        isFetchNextPageError={messagesQuery.isFetchNextPageError}
        historyNavigationPending={historyNavigationPending}
        retryPending={retryPending}
        loadOlder={loadOlder}
        retryReply={retryReply}
      />
      <ThreadDock onSizeChange={setTimelineEndInset}>
        {historical ? (
          <ThreadHistoryReturn
            error={returnToLatestMutation.isError}
            pending={returnToLatestMutation.isPending}
            returnToLatest={returnToLatest}
          />
        ) : (
          <ThreadComposer
            key={`composer:${threadId}`}
            threadId={threadId}
            model={model}
            modelPending={modelPending}
            operationPending={operationPending}
            messageMaxCodeUnits={threadView.messageMaxCodeUnits}
            composerControls={composerControls}
          />
        )}
      </ThreadDock>
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
    position: "relative",
  },
  composerShell: {
    bottom: 0,
    left: 0,
    marginInline: "auto",
    maxWidth: "42rem",
    paddingBlock: "0 1.5rem",
    paddingInline: "1.5rem",
    position: "absolute",
    right: 0,
    width: "100%",
    zIndex: 1,
  },
  historyReturn: {
    alignItems: "center",
    backgroundColor: tokens.surfaceRaised,
    borderColor: tokens.surfaceRaisedBorder,
    borderRadius: tokens.radiusLarge,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    gap: "1rem",
    justifyContent: "space-between",
    padding: "0.75rem",
  },
  historyDescription: {
    color: tokens.muted,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
  },
  historyError: {
    color: tokens.danger,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    marginTop: "0.375rem",
  },
});
