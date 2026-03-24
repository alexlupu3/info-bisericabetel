# ADR-004: 50% Vertical Threshold for Drag-and-Drop Insert Position

## Status
Accepted

## Context
The Content Page admin uses `@dnd-kit/core` and `@dnd-kit/sortable` for reordering items and groups. The previous implementation always resolved the final insert position via `arrayMove(from, to)` where `to` was the index of the hovered element. This meant the direction of insertion (before vs after the target) was determined solely by `closestCenter` collision detection, which does not distinguish upper vs lower halves of the target. Users found it difficult to predict whether a dragged element would land before or after its target.

## Options Considered
1. **Keep `closestCenter` only** — simple but gives no control over before/after placement.
2. **Replace with `closestCorners`** — still doesn't solve the before/after ambiguity.
3. **50% vertical threshold on pointer position** — compare the mid-Y of the dragged element to the mid-Y of the target element; upper half → insert before, lower half → insert after.

## Decision
Use the 50% vertical threshold (option 3). On `dragEnd`, for same-container reorders, compute the final pointer Y position as the activator Y (captured on drag start from `activatorEvent.clientY`) plus the total pointer delta (`delta.y` from the `DragEndEvent`):

```ts
// Captured at drag start:
activatorYRef.current = activatorEvent.clientY

// Used at drag end:
const pointerY = activatorY + delta.y
const insertBefore = pointerY < (over.rect.top + over.rect.height / 2)
```

Then adjust the `to` index passed to `arrayMove` so that:
- `insertBefore && from < to` → `to - 1` (avoid overshooting)
- `!insertBefore && from > to` → `to + 1` (avoid undershooting)

This applies to both root-level reordering and within-group reordering. Cross-container moves are unaffected.

### Why pointer Y instead of active rect mid-Y
The initial implementation used `active.rect.current.translated` (the DragOverlay's current rect). This is inaccurate because dnd-kit measures the DragOverlay with `ignoreTransform: true` (`getTransformAgnosticClientRect`), returning the element's position before CSS transforms are applied. The DragOverlay is positioned via `position: fixed; top: rect.top` plus a CSS transform, so ignoring the transform returns an incorrect base position. The `activatorY + delta.y` approach uses the actual pointer coordinates tracked by the sensor, which are reliable in all environments including Cypress synthetic-event tests.

## Consequences
- Drag-and-drop placement is now predictable and follows the cursor's position relative to the target element midpoint.
- The `reorderInContainer` function has an optional `insertBefore` parameter (default `false` for backward compatibility).
- `handleDragStart` captures `activatorEvent.clientY` into a ref; `handleDragEnd` uses `activatorY + delta.y` for the threshold comparison.
- Cypress regression tests document and guard the threshold behavior and work correctly because pointer Y is based on `clientY` from the synthetic events.
