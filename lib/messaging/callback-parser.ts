const DAY_MS = 24 * 60 * 60 * 1000;
const CALLBACK_TIMEZONE = "Asia/Singapore";

export type CallbackPreset = "today_evening" | "tonight" | "tomorrow" | "custom";

export type CallbackSlot = {
  dateKey: string;
  timeKey: string;
  label: string;
  preset: CallbackPreset;
  source: "option_1" | "option_2" | "option_3" | "option_4" | "natural_language";
  capturedSlots: Array<{ dateKey: string; timeKey: string; text: string }>;
};

export type CallbackParseResult =
  | { kind: "none" }
  | { kind: "ambiguous"; prompt: string }
  | { kind: "invalid"; prompt: string }
  | { kind: "matched"; slot: CallbackSlot };

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function todayDateKey(now: Date) {
  return getSgtDateKey(now);
}

function plusDaysDateKey(now: Date, days: number) {
  return getSgtDateKey(new Date(now.getTime() + days * DAY_MS));
}

function getSgtDateKey(input: Date) {
  const formatter = new Intl.DateTimeFormat("en-SG", {
    timeZone: CALLBACK_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(input);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

function presetSlot(preset: Exclude<CallbackPreset, "custom">, now: Date): CallbackSlot {
  if (preset === "today_evening") {
    return {
      dateKey: todayDateKey(now),
      timeKey: "18:30",
      label: "today evening",
      preset,
      source: "option_1",
      capturedSlots: [],
    };
  }
  if (preset === "tonight") {
    return {
      dateKey: todayDateKey(now),
      timeKey: "21:30",
      label: "tonight",
      preset,
      source: "option_2",
      capturedSlots: [],
    };
  }
  return {
    dateKey: plusDaysDateKey(now, 1),
    timeKey: "18:30",
    label: "tomorrow evening",
    preset: "tomorrow",
    source: "option_3",
    capturedSlots: [],
  };
}

function parseOptionNumber(text: string): 1 | 2 | 3 | 4 | null {
  const match = text.match(/^\s*([1-4])(?:\D|$)/);
  if (!match) return null;
  return Number(match[1]) as 1 | 2 | 3 | 4;
}

function parseAmPmHour(hourRaw: string, minuteRaw: string | undefined, ampmRaw: string) {
  const hour12 = Number(hourRaw);
  const minute = minuteRaw ? Number(minuteRaw) : 0;
  if (!Number.isFinite(hour12) || hour12 < 1 || hour12 > 12) return null;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;

  const suffix = ampmRaw.toLowerCase();
  let hour24 = hour12 % 12;
  if (suffix === "pm") hour24 += 12;
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseTime24(hourRaw: string, minuteRaw: string) {
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function resolveRelativeDay(text: string): number | null {
  if (/\bday after tomorrow\b/.test(text)) return 2;
  if (/\b(tomorrow|tmr|tmrw)\b/.test(text)) return 1;
  if (/\b(today|tonight|this evening)\b/.test(text)) return 0;
  return null;
}

function fallbackWindowTime(text: string) {
  if (/\btonight\b/.test(text)) return "21:30";
  if (/\bevening\b/.test(text)) return "18:30";
  if (/\bafternoon\b/.test(text)) return "15:00";
  if (/\bmorning\b/.test(text)) return "10:00";
  return null;
}

function parseNaturalSlots(text: string, now: Date) {
  const slots: Array<{ dateKey: string; timeKey: string; text: string }> = [];
  const dayOffset = resolveRelativeDay(text);
  const dateKey = plusDaysDateKey(now, dayOffset ?? 0);

  const ampmPattern = /\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/gi;
  let ampmMatch = ampmPattern.exec(text);
  while (ampmMatch) {
    const timeKey = parseAmPmHour(ampmMatch[1], ampmMatch[2], ampmMatch[3]);
    if (timeKey) {
      slots.push({ dateKey, timeKey, text: ampmMatch[0] });
    }
    ampmMatch = ampmPattern.exec(text);
  }

  const twentyFourPattern = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;
  let twentyFourMatch = twentyFourPattern.exec(text);
  while (twentyFourMatch) {
    const timeKey = parseTime24(twentyFourMatch[1], twentyFourMatch[2]);
    if (timeKey) {
      slots.push({ dateKey, timeKey, text: twentyFourMatch[0] });
    }
    twentyFourMatch = twentyFourPattern.exec(text);
  }

  if (slots.length === 0) {
    const fallbackTime = fallbackWindowTime(text);
    if (fallbackTime && dayOffset != null) {
      slots.push({ dateKey, timeKey: fallbackTime, text: fallbackTime });
    }
  }

  const deduped = new Map<string, { dateKey: string; timeKey: string; text: string }>();
  for (const slot of slots) {
    deduped.set(`${slot.dateKey}|${slot.timeKey}`, slot);
  }
  return [...deduped.values()];
}

function callbackPromptTemplate() {
  return [
    "Could you share your preferred callback time?",
    "Reply with:",
    "1. Today evening (after 6 PM)",
    "2. Tonight (after 9 PM)",
    "3. Tomorrow",
    "4. Your preferred time - share 2-3 slots",
  ].join("\n");
}

function containsCallbackIntent(text: string) {
  return /\b(callback|call back|call me|phone call|schedule|slot|time)\b/.test(text);
}

export function isCallbackPromptText(text: string) {
  const normalized = normalizeText(text);
  return (
    normalized.includes("reply with one option") ||
    normalized.includes("today evening (after 6 pm)") ||
    normalized.includes("tonight (after 9 pm)") ||
    normalized.includes("share 2-3 slots") ||
    normalized.includes("when would you like them to call you back")
  );
}

export function shouldTryCallbackParser(input: {
  userText: string;
  lastAssistantMessages: string[];
}) {
  const normalizedUser = normalizeText(input.userText);
  if (!normalizedUser) return false;
  if (/^\s*[1-9]\s*$/.test(normalizedUser)) return true;
  if (containsCallbackIntent(normalizedUser)) return true;
  return input.lastAssistantMessages.some((text) => isCallbackPromptText(text));
}

export function parseCallbackChoice(input: {
  userText: string;
  now?: Date;
}): CallbackParseResult {
  const now = input.now ?? new Date();
  const normalized = normalizeText(input.userText);
  if (!normalized) return { kind: "none" };

  const numericOnly = normalized.match(/^\s*(\d+)\s*$/)?.[1] ?? null;
  if (numericOnly && !["1", "2", "3", "4"].includes(numericOnly)) {
    return { kind: "invalid", prompt: callbackPromptTemplate() };
  }

  const option = parseOptionNumber(normalized);
  if (option === 1) return { kind: "matched", slot: presetSlot("today_evening", now) };
  if (option === 2) return { kind: "matched", slot: presetSlot("tonight", now) };
  if (option === 3) return { kind: "matched", slot: presetSlot("tomorrow", now) };
  if (option === 4) {
    const customSlots = parseNaturalSlots(normalized, now);
    if (customSlots.length === 0) {
      return {
        kind: "ambiguous",
        prompt: "Sure - please share 2-3 specific time slots (for example: tomorrow 3:00 PM, tomorrow 7:30 PM).",
      };
    }
    const first = customSlots[0];
    return {
      kind: "matched",
      slot: {
        dateKey: first.dateKey,
        timeKey: first.timeKey,
        label: "your preferred time",
        preset: "custom",
        source: "option_4",
        capturedSlots: customSlots,
      },
    };
  }

  const naturalSlots = parseNaturalSlots(normalized, now);
  if (naturalSlots.length > 0) {
    const first = naturalSlots[0];
    return {
      kind: "matched",
      slot: {
        dateKey: first.dateKey,
        timeKey: first.timeKey,
        label: `${first.dateKey} at ${first.timeKey}`,
        preset: "custom",
        source: "natural_language",
        capturedSlots: naturalSlots,
      },
    };
  }

  if (/\b(tomorrow|tmr|tmrw)\b/.test(normalized)) {
    return { kind: "matched", slot: presetSlot("tomorrow", now) };
  }
  if (/\btonight\b/.test(normalized)) {
    return { kind: "matched", slot: presetSlot("tonight", now) };
  }
  if (/\btoday evening\b|\bthis evening\b/.test(normalized)) {
    return { kind: "matched", slot: presetSlot("today_evening", now) };
  }

  if (containsCallbackIntent(normalized)) {
    return { kind: "ambiguous", prompt: callbackPromptTemplate() };
  }

  return { kind: "none" };
}

export function buildCallbackConfirmation(input: {
  label: string;
  duplicate: boolean;
}) {
  const prefix = input.duplicate ? "Perfect, I have already noted" : "Perfect. I have noted";
  return `${prefix} ${input.label} for your callback. Our admissions team will contact you then.`;
}
