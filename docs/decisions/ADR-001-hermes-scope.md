# ADR-001: Hermes Scope — Interpretation A (Inner Cluely Operator)

**Status**: Accepted
**Date**: 2026-04-22
**Deciders**: Engineering team
**Related Issues**: #2, #15, #17, #19, #25

## Context

Cluely.fr needs an internal orchestration layer ("Hermes") to coordinate features that react to application events — calendar reminders, email context, meeting state changes, etc. Three interpretations of Hermes's scope were considered:

| Interpretation | Scope | Observes |
|----------------|-------|----------|
| **A — Inner Cluely Operator** | In-process orchestrator within the Electron main process | Only data Cluely already holds (app state, IPC events, services) |
| **B — Cross-app Observer** | Monitors other macOS applications | Desktop app state, window focus, running apps |
| **C — Whole-desktop Observer** | Full desktop awareness | Screen capture, clipboard, filesystem, all apps |

## Decision

**We commit to Interpretation A: Inner Cluely Operator.**

Hermes is a thin, in-process event orchestrator that lives inside the Electron main process. It subscribes to events that Cluely already produces (IPC messages, service callbacks, state changes) and dispatches them to typed handler functions.

### What Hermes IS

- An event bus that re-emits internal Cluely events as typed `hermes:*` events
- A handler registry where features register functions to react to those events
- A coordination layer that lets features respond to cross-cutting concerns without direct coupling
- Entirely contained within the existing Electron process — no new processes, no new persistence

### What Hermes is NOT

- Not a cross-application observer (no monitoring of other macOS apps)
- Not a desktop-wide awareness system (no screen capture, clipboard access, or filesystem scanning)
- Not a new persistence layer (reads from existing stores owned by other modules)
- Not a state-sharing mechanism (handlers must request state via events, not read other features' state directly)

## Consequences

### Positive

- **Minimal surface area**: No new permissions, no new system access, no privacy concerns
- **Unblocks immediately**: Issues #2, #15, #17, #19, #25 can proceed using Hermes's event bus
- **Safe to ship**: No risk of unintended data collection or observation
- **Simple mental model**: Hermes = "when X happens in Cluely, do Y"

### Negative

- **Cannot observe external apps**: Features requiring cross-app awareness must wait for a future ADR amendment
- **Limited to existing data**: Hermes can only orchestrate what Cluely already knows

### Neutral

- Interpretations B and C are not rejected permanently — they require a new ADR that explicitly amends this one
- Any PR introducing desktop observation, clipboard access, or cross-app monitoring MUST reference this ADR and propose an amendment before merging

## Amendment Process

To expand Hermes's scope beyond Interpretation A:

1. Draft a new ADR (e.g., ADR-002) that references and amends ADR-001
2. Clearly state which interpretation (B or C) is being adopted and why
3. Address privacy, permissions, and security implications
4. Obtain team review and approval before merging
