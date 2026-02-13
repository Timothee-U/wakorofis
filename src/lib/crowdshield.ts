const DEVICE_ID_KEY = 'crowdshield_device_id';
const LAST_REPORT_KEY = 'crowdshield_last_report';
const RATE_LIMIT_SECONDS = 60;

export function getDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

export function canSubmitReport(): boolean {
  const lastReport = localStorage.getItem(LAST_REPORT_KEY);
  if (!lastReport) return true;
  const elapsed = (Date.now() - parseInt(lastReport, 10)) / 1000;
  return elapsed >= RATE_LIMIT_SECONDS;
}

export function getSecondsUntilNextReport(): number {
  const lastReport = localStorage.getItem(LAST_REPORT_KEY);
  if (!lastReport) return 0;
  const elapsed = (Date.now() - parseInt(lastReport, 10)) / 1000;
  return Math.max(0, Math.ceil(RATE_LIMIT_SECONDS - elapsed));
}

export function markReportSubmitted(): void {
  localStorage.setItem(LAST_REPORT_KEY, Date.now().toString());
}

export const ZONES = ['Gate A', 'Gate B', 'Front Stage', 'VIP', 'Exit'] as const;
export type Zone = typeof ZONES[number];

export const CATEGORIES = [
  { id: 'crowd_pressure', label: 'Crowd Pressure', icon: '👥' },
  { id: 'fight', label: 'Fight', icon: '🥊' },
  { id: 'medical', label: 'Medical Emergency', icon: '🏥' },
  { id: 'fire', label: 'Fire / Hazard', icon: '🔥' },
  { id: 'other', label: 'Other', icon: '⚠️' },
] as const;
export type Category = typeof CATEGORIES[number]['id'];
