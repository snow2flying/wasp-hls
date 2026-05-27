# `getSeekableMinimumPosition` method

## Description

`getSeekableMinimumPosition` is a method allowing to obtain the minimum
playlist position in seconds currently known to be seekable.

For live contents, that value is re-synchronized when Media Playlists are
updated and does not progress linearly between those updates.

For a linearly progressing application-facing position, use
[`getMinimumPosition`](./getMinimumPosition.md) instead.

If no content is currently loaded, `getSeekableMinimumPosition` will return
`undefined`.

## About "playlist time"

As written above, the returned time is in playlist time in seconds.

If you wish to convert between media time and playlist time, you may obtain the
offset between the two through the
[`getMediaOffset` method](./getMediaOffset.md).
If you wish to convert that playlist time into a JavaScript `Date` when the
content timeline is based on `EXT-X-PROGRAM-DATE-TIME`, you may call the
[`positionToDate` method](./positionToDate.md).

## Syntax

```js
const minimumPosition = player.getSeekableMinimumPosition();
```

- **return value**:

`number|undefined`: The minimum currently known seekable position, in playlist
time in seconds. `undefined` if no content is currently loaded.
