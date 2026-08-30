# Application lifetimes

Jaquelene treats lifetime as an ownership contract, not as a particular library. Every resource has
one owner, every owner releases its children, and no feature installs process- or application-wide
state outside the appropriate composition boundary.

## Ownership tree

```text
Electron process host
├─ application diagnostics
└─ desktop application Effect scope
   ├─ packaged-app protocol handler
   ├─ backend ManagedRuntime
   │  ├─ content database
   │  ├─ resource cache and cache database
   │  ├─ provider adapters and active provider operations
   │  └─ generation supervisor and active generations
   └─ main-window scope
      ├─ BrowserWindow
      ├─ frame-scoped IPC implementations
      ├─ thread and model-catalog dispatch destinations
      └─ window preference subscriptions and Electron listeners

Renderer application DisposableStack
├─ global error reporting
├─ page-lifetime listener
├─ QueryClient
├─ backend-event reconciliation
└─ React root

React component lifetime
└─ DOM observers, subscriptions, and imperative effects owned by hook cleanup
```

Dependency arrows point down this tree. Release runs upward: children stop before the services they
use. Diagnostics are deliberately outside the desktop application scope so startup, runtime, and
shutdown failures remain reportable until application resources have finished closing.

## Boundary mechanisms

| Boundary             | Mechanism                           | Reason                                                                                                         |
| -------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Electron process     | Explicit host state machine         | Electron quit negotiation, the single-instance lease, and the shutdown watchdog are terminal process concerns. |
| Desktop application  | Effect `Scope` and `acquireRelease` | Protocol, backend, and window acquisition have ordered asynchronous failure and release paths.                 |
| Backend              | Effect `Layer` and `ManagedRuntime` | Database, cache, providers, storage, and application services form a dependency graph.                         |
| Individual window    | Effect `Scope`                      | A window can close and reopen while the desktop application remains alive.                                     |
| Renderer application | Native `DisposableStack`            | Renderer-global resources are synchronous and have a strict reverse acquisition order.                         |
| React component      | Cleanup returned by React hooks     | Component-local resources follow React mounting rather than application lifetime.                              |

These mechanisms must not be collapsed into a project-specific lifetime framework. Consistency
comes from ownership and shutdown semantics. Effect stays at orchestration boundaries; renderer and
domain code do not acquire Effect as a dependency merely to look uniform.

## Resource contract

A resource is anything that can remain active after its creator returns: an open handle, listener,
subscription, timer, observer, worker, supervised operation, background queue, runtime, or mutable
dispatcher destination.

Every resource must satisfy the following contract:

1. Its nearest longer-lived owner acquires it.
2. Cleanup is registered immediately after successful acquisition, before the next fallible step.
3. Partial acquisition failure releases everything already acquired.
4. Closing stops admission of new work before interrupting existing work.
5. Owned work is either drained or explicitly abandoned by contract; it is never accidentally left
   running.
6. Dependencies release in reverse acquisition order.
7. Repeated and concurrent close calls share one completion result.
8. Terminal close failures remain observable and retain their original causes.
9. A long-lived state machine exposes inspection with meaningful states such as `open`, `closing`,
   and `closed`.
10. A closed instance is not reused. Reopening means constructing a new instance from persisted
    state.

Reusable owned handles implement `Symbol.dispose` or `Symbol.asyncDispose` when their close
semantics match the standard protocol. A named `close`, `stop`, or `quit` operation may also exist
when its domain semantics are useful to callers, but every entry point delegates to the same
single-flight shutdown path.

Caller cancellation and owner cancellation are different:

- Caller cancellation stops that caller from waiting. Shared work continues when another owner or
  waiter still needs it.
- Owner cancellation stops admission, signals the owned operation, and participates in shutdown
  draining.

## What does not need a lifetime

Do not manufacture lifecycle abstractions for stateless functions, immutable values, synchronous
calculations, completed one-shot I/O, or storage adapters that retain no live watcher or open handle.
If one of these later gains a timer, listener, queue, or handle, its contract changes and its owner
must acquire it as a resource.

React layout and DOM behavior remains component-owned. A `ResizeObserver`, event listener, or DOM
class added by a component belongs in that component's hook cleanup; it does not belong in the
renderer application stack.

## Adding a feature or subsystem

Before implementation, answer these questions:

1. What remains alive after construction or after an operation returns?
2. Which existing node in the ownership tree outlives it by exactly one level?
3. Does it need application, window, renderer, component, or request lifetime?
4. What stops new work during closing?
5. Which operations receive the owner's cancellation signal?
6. What must drain before dependencies close?
7. How are state and terminal failure inspected?
8. How is a closed instance reopened?

Then implement at the owning boundary:

- Backend infrastructure becomes an Effect service layer acquired by the backend runtime.
- A provider capability is owned by its provider adapter or the provider subsystem, not by IPC.
- An Electron listener or subscription tied to one window is finalized by that window's scope.
- A renderer-global installer returns one idempotent disposer and is registered by
  `renderer-application.tsx`.
- A component-local observer or listener returns cleanup from its React hook.
- `main.ts` files only invoke their application bootstrap; features are composed below that call.

IPC transports state and intent. It does not own backend operations. Frame-scoped generated IPC
implementations die with their Electron frame; additional subscriptions or dispatcher registries
must still be registered in the window scope.

## Verification checklist

Resource tests should be written at the lowest stable owner and cover the risks that exist:

- acquisition failure releases partially acquired dependencies;
- close rejects new work;
- active work receives owner cancellation and is drained;
- concurrent close calls share completion;
- listeners, subscriptions, and destinations are removed;
- dependency release order is correct;
- terminal cleanup failures remain inspectable;
- a new instance can reopen persisted state after close.

Do not add lifecycle tests to stateless features. Test the owner that can actually leak or race.

## Process-lifetime exceptions

Electron operations that are intentionally irreversible for the current process, such as privileged
scheme registration before readiness and the application user-model identity, belong exclusively in
desktop bootstrap. Adding another irreversible process action requires an explicit product decision;
it must not be hidden inside a feature module.
