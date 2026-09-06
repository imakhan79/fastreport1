export type ScheduleFrequency = "daily" | "weekly" | "monthly";

export type ScheduleInput = {
  frequency: ScheduleFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  hourUtc: number;
};

export class ScheduleInputError extends Error {}

export function validateScheduleInput(input: ScheduleInput): void {
  if (!["daily", "weekly", "monthly"].includes(input.frequency)) {
    throw new ScheduleInputError("frequency must be 'daily', 'weekly', or 'monthly'.");
  }
  if (!Number.isInteger(input.hourUtc) || input.hourUtc < 0 || input.hourUtc > 23) {
    throw new ScheduleInputError("hourUtc must be an integer between 0 and 23.");
  }
  if (input.frequency === "weekly") {
    if (input.dayOfWeek === null || !Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 0 || input.dayOfWeek > 6) {
      throw new ScheduleInputError("dayOfWeek (0-6, Sunday=0) is required for weekly schedules.");
    }
  }
  if (input.frequency === "monthly") {
    if (
      input.dayOfMonth === null ||
      !Number.isInteger(input.dayOfMonth) ||
      input.dayOfMonth < 1 ||
      input.dayOfMonth > 28
    ) {
      throw new ScheduleInputError("dayOfMonth (1-28) is required for monthly schedules.");
    }
  }
}

/** First occurrence at or after `now` that matches the schedule's cadence. */
export function computeInitialNextRun(input: ScheduleInput, now: Date): Date {
  if (input.frequency === "daily") {
    const candidate = atHour(now, input.hourUtc);
    return candidate > now ? candidate : addDays(candidate, 1);
  }

  if (input.frequency === "weekly") {
    let candidate = atHour(now, input.hourUtc);
    for (let i = 0; i < 8; i++) {
      if (candidate.getUTCDay() === input.dayOfWeek && candidate > now) return candidate;
      candidate = addDays(candidate, 1);
    }
    throw new ScheduleInputError("Could not compute next run for weekly schedule.");
  }

  // monthly
  let candidate = atDayAndHour(now, input.dayOfMonth!, input.hourUtc);
  if (candidate <= now) candidate = atDayAndHour(addMonths(now, 1), input.dayOfMonth!, input.hourUtc);
  return candidate;
}

/** Next occurrence strictly after the run that just fired, anchored to its own timestamp to avoid drift. */
export function advanceNextRun(input: ScheduleInput, previousRunAt: Date): Date {
  if (input.frequency === "daily") return addDays(previousRunAt, 1);
  if (input.frequency === "weekly") return addDays(previousRunAt, 7);
  return atDayAndHour(addMonths(previousRunAt, 1), input.dayOfMonth!, input.hourUtc);
}

function atHour(date: Date, hourUtc: number): Date {
  const d = new Date(date);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

function atDayAndHour(date: Date, dayOfMonth: number, hourUtc: number): Date {
  const d = new Date(date);
  d.setUTCDate(dayOfMonth);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export function describeSchedule(input: ScheduleInput): string {
  const time = `${String(input.hourUtc).padStart(2, "0")}:00 UTC`;
  if (input.frequency === "daily") return `Daily at ${time}`;
  if (input.frequency === "weekly") {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return `Weekly on ${days[input.dayOfWeek!]} at ${time}`;
  }
  return `Monthly on day ${input.dayOfMonth} at ${time}`;
}
