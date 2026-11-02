// Game calendar (01 §4): monthIndex 0 = January 2033, on the real calendar. Pure module.
import { START_YEAR } from '../config.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Calendar year and 0-based month for a monthIndex. */
export function yearMonth(i) {
  const total = START_YEAR * 12 + i;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** "January 2033" for monthIndex 0. */
export function monthLabel(i) {
  const { year, month } = yearMonth(i);
  return `${MONTHS[month]} ${year}`;
}

/** Month name only ("February"). */
export function monthName(i) {
  return MONTHS[yearMonth(i).month];
}

/** Days in the month at monthIndex i (leap years included). */
export function daysInMonth(i) {
  const { year, month } = yearMonth(i);
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Weekday 0 (Sunday)–6 (Saturday) of day `day` (1-based) in month i. */
export function weekday(i, day) {
  const { year, month } = yearMonth(i);
  return new Date(Date.UTC(year, month, day)).getUTCDay();
}

/** "Saturday, January 1" for month i, day `day`. */
export function dayLabel(i, day) {
  return `${WEEKDAYS[weekday(i, day)]}, ${MONTHS[yearMonth(i).month]} ${day}`;
}

/**
 * Paperwork dates for a home that starts in month i (task 58): documents are signed the month before and the move-in
 * is the 1st of month i. i = 0 → {signLabel: "December 2032", moveInLabel: "January 1, 2033"}.
 */
export function moveDates(i) {
  const { year } = yearMonth(i);
  return { signLabel: monthLabel(i - 1), moveInLabel: `${MONTHS[yearMonth(i).month]} 1, ${year}` };
}
