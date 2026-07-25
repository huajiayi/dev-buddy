const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/**
 * Format timestamps identically during server rendering and browser hydration.
 * Dev Buddy currently presents its administration timestamps in China Standard Time.
 */
export function formatDateTime(value: string | number | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const chinaTime = new Date(date.getTime() + CHINA_TIME_OFFSET_MS);
  return [
    `${chinaTime.getUTCFullYear()}-${pad(chinaTime.getUTCMonth() + 1)}-${pad(chinaTime.getUTCDate())}`,
    `${pad(chinaTime.getUTCHours())}:${pad(chinaTime.getUTCMinutes())}:${pad(chinaTime.getUTCSeconds())}`,
  ].join(" ");
}
