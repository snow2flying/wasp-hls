# `getMinimumPosition` method

## Description

`getMinimumPosition` is a method allowing to obtain the minimum playlist
position in seconds applications should currently consider available.

Basically, it is the first reachable position in the fetched media playlist, or
if there's separate audio and a video Media Playlists, the minimum of that first
reachable position between both of them (written another way: the minimum
reachable position with both audio and video playable data).

Its intended purpose is to expose an application-facing lower content
boundary.

If no content is currently loaded, `getMinimumPosition` will return `undefined`.

Note that this minimum position might evolve over time, depending on the type
of content being played. More information on this in this documentation page.

## About "playlist time"

As written above, the returned time is in playlist time in seconds.

What I mean by that is that that time is expressed as the time extrapolated
from the MediaPlaylist (for example for a live content, it might be the unix
timestamp corresponding to the time at which the corresponding media was
broadcasted), which might be different from the "media time" actually associated
to the HTML media element (such as the `currentTime` attribute from an
`HTMLMediaElement`).

In the `WaspHlsPlayer`, we always rely on playlist time to facilitate usage of
the API.
If you wish to convert between media time and playlist time (for example if you
want to exploit HTML properties), you may obtain the offset between the two
through the [getMediaOffset method](./getMediaOffset.md).
If you wish to convert that playlist time into a JavaScript `Date` when the
content timeline is based on `EXT-X-PROGRAM-DATE-TIME`, you may call the
[positionToDate method](./positionToDate.md).

## For live contents and other non-VoD contents

When playing some types of contents such as live contents, the minimum reachable
position might increase over time as old data may become progressively
unavailable.

To be alerted when the minimum position changes, you may want to listen to the
`contentInfoUpdate` [event](../Player_Events.md) which sends a `minimumPosition`
property reflecting that new minimum position as a payload.

It should be noted that in this evoked scenario, the value returned by
`getMinimumPosition` might change, but will only do so gradually, e.g. once one
of the Media Playlist is updated.
This might be counter-intuitive if for example you expect the minimum position
to increase linearly (for example a 1 second increase every seconds) over time.

If you need the minimum currently known seekable bound instead, you can call
[`getSeekableMinimumPosition`](./getSeekableMinimumPosition.md).

As a general rule, changes of the minimum position should be expected if it is a
live content.
You can know is you're playing a live content by calling the [`isLive`
method](../Playback_Information/isLive.md) after reaching the `"Loaded"`
[state](../Basic_Methods/getPlayerState.md) for that content or by reading the
`isLive` property from a `contentInfoUpdate` event (which is moreover first sent
even before the `"Loaded"` state is reached).

On live contents, the minimum position increase can generally be approximated as
a linear increase (such as 1 second every seconds) until the end of the content.
You can know is you're playing a live content by calling the [`isLive`
method](../Playback_Information/isLive.md) after reaching the `"Loaded"`
[state](../Basic_Methods/getPlayerState.md) for that content or by reading the
`isLive` property from the `contentInfoUpdate` event. Once the live is ended,
`isLive` should return `false`.

Note that a content may also become a VoD once it is finished, at which point
the minimum position will be guaranteed to be definitive.
To react directly to this eventuality, you may want to listen to the
`contentInfoUpdate` [event](../Player_Events.md) and read its `isVoD` property,
or call the [`isVod` method](../Playback_Information/isVod.md).

## Syntax

```js
const minimumPosition = player.getMinimumPosition();
```

- **return value**:

`number|undefined`: The minimum position with playable content. in playlist time
in seconds. `undefined` if no content is currently loaded.
