import * as React from "react";
import { toClockTime, toDateTime, toHours, toMinutes } from "../utils/time";

/**
 * Horizontal (left-to-right) progress bar component which:
 *
 *   - represents the current position and the buffer relatively to the
 *     minimum / maximum position.
 *
 *   - triggers a seek function with the clicked position on click
 * @param {Object} props
 * @returns {Object}
 */
export default React.memo(function ProgressBar({
  seek,
  position,
  bufferGap,
  duration,
  minimumPosition,
  maximumPosition,
  positionToDate,
}: {
  seek: (pos: number) => void;
  position: number;
  bufferGap: number;
  duration: number;
  minimumPosition: number;
  maximumPosition: number;
  positionToDate: (pos: number) => Date | undefined;
}): React.JSX.Element {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const [hoveredPosition, setHoveredPosition] = React.useState<
    { px: number; value: number } | undefined
  >(undefined);

  const seekWindowDuration = Math.max(maximumPosition - minimumPosition, 0);

  const getMouseData = React.useCallback(
    (event: { clientX: number }) => {
      if (wrapperRef.current === null) {
        return;
      }
      const rect = wrapperRef.current.getBoundingClientRect();
      const point0 = rect.left;
      const clickPosPx = Math.min(
        Math.max(event.clientX - point0, 0),
        Math.max(rect.right - point0, 0),
      );
      const endPointPx = Math.max(rect.right - point0, 0);
      if (!endPointPx) {
        return { px: 0, value: minimumPosition };
      }
      return {
        px: clickPosPx,
        value: (clickPosPx / endPointPx) * seekWindowDuration + minimumPosition,
      };
    },
    [minimumPosition, seekWindowDuration],
  );

  const relativePosition = Math.max(position - minimumPosition, 0);
  const percentBuffered =
    Math.min((bufferGap + relativePosition) / seekWindowDuration, 1) * 100;

  const percentPosition =
    Math.min(relativePosition / seekWindowDuration, 1) * 100;

  let hoverDate: Date | undefined;
  let hoverLabel: string | undefined;
  let hoverTitle: string | undefined;
  if (hoveredPosition !== undefined) {
    hoverDate = positionToDate(hoveredPosition.value);
    if (hoverDate !== undefined) {
      hoverLabel = toClockTime(hoverDate);
      hoverTitle = toDateTime(hoverDate);
    } else if (duration >= 60 * 60) {
      hoverLabel = toHours(hoveredPosition.value);
    } else {
      hoverLabel = toMinutes(hoveredPosition.value);
    }
  }

  return (
    <div
      className="progress-bar-wrapper"
      ref={wrapperRef}
      onClick={(event) => {
        const mouseData = getMouseData(event);
        if (mouseData !== undefined) {
          seek(mouseData.value);
        }
      }}
      onMouseMove={(event) => {
        setHoveredPosition(getMouseData(event));
      }}
      onMouseLeave={() => {
        setHoveredPosition(undefined);
      }}
    >
      {hoveredPosition === undefined || hoverLabel === undefined ? null : (
        <div
          className="progress-bar-hover-hint"
          style={{ left: `${hoveredPosition.px}px` }}
          title={hoverTitle}
        >
          {hoverLabel}
        </div>
      )}
      <div
        className="progress-bar-current"
        style={{
          width: String(percentPosition) + "%",
        }}
      />
      <div
        className="progress-bar-buffered"
        style={{
          width: String(percentBuffered) + "%",
        }}
      />
    </div>
  );
});
