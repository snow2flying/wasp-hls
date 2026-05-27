# `positionToDate` method

## Description

`positionToDate` converts a position expressed in playlist time into a
JavaScript `Date` when the current content timeline is based on
`EXT-X-PROGRAM-DATE-TIME`.

This is useful to convert the values returned by methods such as
[`getPosition`](./getPosition.md), [`getMinimumPosition`](./getMinimumPosition.md),
[`getMaximumPosition`](./getMaximumPosition.md),
[`getSeekableMinimumPosition`](./getSeekableMinimumPosition.md) and
[`getSeekableMaximumPosition`](./getSeekableMaximumPosition.md).

It returns `undefined` when:

- no content is currently loaded
- the current timeline is not based on `EXT-X-PROGRAM-DATE-TIME`
- the given position is not a finite number

To check if the currently loaded content exposes such a timeline, you can call
[`usesProgramDateTime`](../Playback_Information/usesProgramDateTime.md).

## Syntax

```js
const currentDate = player.positionToDate(player.getPosition());
const minimumDate = player.positionToDate(player.getMinimumPosition());
```

- **arguments**:
  1. _position_ `number`: The position, in playlist time and in seconds, to
     convert.

- **return value**:

`Date|undefined`: The JavaScript `Date` corresponding to that position, if the
current content uses a `EXT-X-PROGRAM-DATE-TIME` timeline.
