/**
 * ZUKAI FORMAT MINUTES HELPER
 * Converts decimal minutes into clean, human-friendly durations.
 * Examples:
 *   formatMinutes(2.7)   => "2 min 42 s"
 *   formatMinutes(5)     => "5 min"
 *   formatMinutes(0.5)   => "30 s"
 *   formatMinutes(0)     => "0 min"
 *   formatMinutes(1.05)  => "1 min 3 s"
 */

export function formatMinutes(decimalMinutes: number): string {
  if (isNaN(decimalMinutes) || decimalMinutes <= 0) {
    return '0 min';
  }

  const totalSeconds = Math.round(decimalMinutes * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds} s`;
  }

  if (seconds === 0) {
    return `${minutes} min`;
  }

  return `${minutes} min ${seconds} s`;
}

/**
 * Short variant: e.g. "2m 42s", "5m"
 */
export function formatMinutesCompact(decimalMinutes: number): string {
  if (isNaN(decimalMinutes) || decimalMinutes <= 0) {
    return '0m';
  }

  const totalSeconds = Math.round(decimalMinutes * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  if (seconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${seconds}s`;
}
