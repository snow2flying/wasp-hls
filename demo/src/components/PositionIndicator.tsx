import * as React from "react";
import { toClockTime, toDateTime, toMinutes, toHours } from "../utils/time";

/**
 * Text with the following structure:
 *   CURRENT_POSITION / DURATION
 * @param {Object} props
 * @returns {Object}
 */
export default React.memo(function PositionInfos({
  position,
  duration,
  currentDate,
}: {
  position: number;
  duration: number;
  currentDate?: Date | undefined;
}) {
  if (
    isNaN(position) ||
    isNaN(duration) ||
    !isFinite(position) ||
    !isFinite(duration)
  ) {
    return null;
  }

  if (currentDate !== undefined) {
    return (
      <div className="position-info">
        <span className="current-position" title={toDateTime(currentDate)}>
          {toClockTime(currentDate)}
        </span>
      </div>
    );
  }

  const convertTime = duration >= 60 * 60 ? toHours : toMinutes;

  return (
    <div className="position-info">
      <span className="current-position">{convertTime(position)}</span>
      <span className="separator">{" / "}</span>
      <span className="duration">{convertTime(duration)}</span>
    </div>
  );
});
