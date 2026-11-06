import { localDayKey, validLocalDay } from './mobile-records.js';

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
export const MIN_SELECTABLE_DAY = '1900-01-01';
export const MAX_SELECTABLE_YEAR = 9999;

function parseDay(value) {
  if (!validLocalDay(value)) throw new Error('日期无效，请重新选择。');
  return new Date(`${value}T12:00:00`);
}
function shiftDay(value, amount) {
  const date = parseDay(value);
  date.setDate(date.getDate() + amount);
  return localDayKey(date);
}
function shiftMonth(value, amount) {
  const [year, month] = value.split('-').map(Number);
  const date = new Date(year, month - 1 + amount, 1, 12);
  if (date.getFullYear() < 1 || date.getFullYear() > MAX_SELECTABLE_YEAR) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function calendarMonth(value = localDayKey()) {
  const day = /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value;
  return validLocalDay(day) ? day.slice(0, 7) : localDayKey().slice(0, 7);
}
export function shiftCalendarMonth(month, amount, minMonth = '1900-01', maxMonth = `${MAX_SELECTABLE_YEAR}-12`) {
  const next = shiftMonth(calendarMonth(month), amount);
  return next < minMonth || next > maxMonth ? calendarMonth(month) : next;
}
export function calendarWeek(value, { today = localDayKey(), min = MIN_SELECTABLE_DAY, max = today } = {}) {
  const selected = validLocalDay(value) ? value : today;
  const mondayOffset = (parseDay(selected).getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, index) => {
    const date = shiftDay(selected, index - mondayOffset);
    return { date, day: Number(date.slice(-2)), disabled: date < min || date > max, today: date === today, selected: date === selected };
  });
}
export function calendarGrid(month, { today = localDayKey(), min = MIN_SELECTABLE_DAY, max = today } = {}) {
  const normalized = calendarMonth(month);
  const first = `${normalized}-01`;
  const mondayOffset = (parseDay(first).getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = shiftDay(first, index - mondayOffset);
    return { date, day: Number(date.slice(-2)), outside: date.slice(0, 7) !== normalized, disabled: date < min || date > max, today: date === today };
  });
}
export function calendarTitle(value) {
  const month = calendarMonth(value);
  return `${Number(month.slice(0, 4))} 年 ${Number(month.slice(-2))} 月`;
}
export function monthOptions(centerYear = new Date().getFullYear(), { pastYears = 100, futureYears = 1 } = {}) {
  const start = Math.max(1, centerYear - pastYears);
  const end = Math.min(MAX_SELECTABLE_YEAR, centerYear + futureYears);
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const value = start + index;
    return { value, label: `${value} 年` };
  });
}
