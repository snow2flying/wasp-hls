export function toSeconds(timeInSeconds: number): string {
  const toInt = Math.floor(timeInSeconds);
  if (!toInt) {
    return "00";
  }

  return String(toInt).padStart(2, "0");
}

export function toMinutes(timeInSeconds: number): string {
  const toInt = Math.floor(timeInSeconds);
  if (!toInt) {
    return "00:00";
  }

  if (toInt < 60) {
    const str = String(toInt);
    return "00:" + str.padStart(2, "0");
  }

  const numberOfMinutes = Math.floor(toInt / 60);
  const numberOfSecondsRemaining = toInt % 60;
  return (
    String(numberOfMinutes).padStart(2, "0") +
    ":" +
    String(numberOfSecondsRemaining).padStart(2, "0")
  );
}

export function toHours(timeInSeconds: number) {
  const toInt = Math.floor(timeInSeconds);
  if (!toInt) {
    return "00:00";
  }

  if (toInt < 60) {
    const str = String(toInt);
    return "00:" + str.padStart(2, "0");
  }

  const numberOfMinutes = Math.floor(toInt / 60);
  const numberOfSecondsRemaining = toInt % 60;
  if (numberOfMinutes < 60) {
    return (
      String(numberOfMinutes).padStart(2, "0") +
      ":" +
      String(numberOfSecondsRemaining).padStart(2, "0")
    );
  }

  const numberOfHours = Math.floor(numberOfMinutes / 60);
  const numberOfMinutesRemaining = numberOfMinutes % 60;
  return (
    String(numberOfHours).padStart(2, "0") +
    ":" +
    String(numberOfMinutesRemaining).padStart(2, "0") +
    ":" +
    String(numberOfSecondsRemaining).padStart(2, "0")
  );
}

export function toDateTime(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
}

export function toClockTime(date: Date): string {
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds} UTC`;
}

export function toShortDateTime(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${month}-${day} ${hours}:${minutes} UTC`;
}
