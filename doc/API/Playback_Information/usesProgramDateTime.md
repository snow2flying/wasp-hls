# `usesProgramDateTime` method

## Description

Returns `true` when the currently-loaded content exposes a playlist timeline
based on `EXT-X-PROGRAM-DATE-TIME`.

When it returns `true`, the position values returned by the player can be
converted to JavaScript `Date`s through the
[`positionToDate`](../Position_Control/positionToDate.md) method.

Returns `false` either when the current content does not expose such a
timeline, or when no content is currently loaded.

## Syntax

```js
const usesProgramDateTime = player.usesProgramDateTime();
```

- **return value**:

`boolean`: `true` if the current content timeline is based on
`EXT-X-PROGRAM-DATE-TIME`.
