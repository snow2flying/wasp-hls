import * as React from "react";
import { toDateTime, toMinutes, toHours } from "../utils/time";

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
  minimumDate,
  maximumDate,
}: {
  position: number;
  duration: number;
  currentDate?: Date | undefined;
  minimumDate?: Date | undefined;
  maximumDate?: Date | undefined;
}) {
  const convertTime = duration >= 60 * 60 ? toHours : toMinutes;
  if (
    isNaN(position) ||
    isNaN(duration) ||
    !isFinite(position) ||
    !isFinite(duration)
  ) {
    return null;
  }
  return (
    <div className="position-info">
      <div>
        <span className="current-position">{convertTime(position)}</span>
        <span className="separator">{" / "}</span>
        <span className="duration">{convertTime(duration)}</span>
      </div>
      {currentDate === undefined ? null : (
        <div className="position-date">{toDateTime(currentDate)}</div>
      )}
      {minimumDate === undefined || maximumDate === undefined ? null : (
        <div className="position-window-date">
          Window: {toDateTime(minimumDate)} {"->"} {toDateTime(maximumDate)}
        </div>
      )}
    </div>
  );
});
