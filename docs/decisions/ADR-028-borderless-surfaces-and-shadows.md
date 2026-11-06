# ADR-028: Borderless surfaces and shadows

- **Status:** Accepted
- **Date:** 2026-11-06
- **Related:** [ADR-022](ADR-022-server-side-head-injection-and-content-snapshot.md), [ADR-027](ADR-027-admin-dialogs-native-dialog-and-modal-content-form.md)

## Context

The public hub and admin used outlines to separate layers, with little tonal separation in dark mode. A shared surface scale makes depth legible while keeping the editorial typography and sharp corners.

## Options Considered

- Retain borders and increase contrast: explicit boundaries, but preserves the line-heavy appearance.
- Use surface steps with soft shadows: clearer layer hierarchy and fewer lines, with an input-boundary contrast trade-off.

## Decision

Both interfaces share the light/dark surface tokens in `packages/app/src/index.css`, retaining system preference and explicit light/dark overrides. Admin accent, on-accent and status colours remain independent; site accents remain data.

- `--bg` is the page; `--surface` with `--sheen`, `--shadow-1` identifies cards and panels.
- `--surface-2` with `--shadow-2` identifies raised/hovered surfaces; secondary buttons and selected rows use the surface step. Selection may also use a 3px inset accent bar.
- `--surface-3` with `--sheen`, `--shadow-3` identifies dialogs, menus, popovers, toasts and drawers. Backdrops use `--scrim`.
- Inputs use the recessed `--field` fill. Dividers become spacing or alternating surface bands. The former border token is removed; table collapse/spacing remains structural.
- Corners stay sharp; existing circles remain. The SSR snapshot uses the same classes and stylesheet as React.
- Interactive elements retain a 2px accent focus-visible outline, offset by 2px. Text fields additionally show a 2px accent inset bottom line on focus. Labels/placeholders remain visible.
- In forced colours, cards, controls, dialogs and menus regain a 1px `CanvasText` border because fills and shadows may disappear. Selected states also receive a system-colour outline.

## Consequences

The recessed input fill intentionally has less than 3:1 contrast against its surroundings. Under WCAG 1.4.11, when that fill is necessary to identify a control, the fill alone does not meet the required non-text contrast. Visible labels/placeholders, a focus outline and a focus-only bottom line improve identification but do not establish compliance for the resting input boundary. This is an accepted design trade-off, not a claim of WCAG 1.4.11 conformance; future accessibility review may require a stronger resting cue.

Forced colours is a deliberate exception to the borderless theme. Browser regression tests cover light/dark public and admin cards, fields, overlays and focus behaviour; visual QA remains necessary when adding new components.
