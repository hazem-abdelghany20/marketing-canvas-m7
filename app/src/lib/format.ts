/** 4182339 → "4.0MB", 2048 → "2KB". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/** "1 file", "3 files". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "now", "5m", "2h", "3d", "2w": how long ago, in the fewest characters. The exact time belongs in a
 * `title` beside it (see formatTimestamp). A time a little in the future, from a clock that runs behind,
 * is "now"; a date that can't be read is empty.
 */
export function relativeTime(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < MINUTE) return "now";
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}m`;
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)}h`;
  if (seconds < 7 * DAY) return `${Math.floor(seconds / DAY)}d`;
  return `${Math.floor(seconds / (7 * DAY))}w`;
}
