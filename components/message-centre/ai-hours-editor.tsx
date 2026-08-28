"use client";

import * as React from "react";
import { Clock, Copy, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AI_HOURS_DAY_KEYS,
  AI_HOURS_DAY_LABELS,
  DEFAULT_AI_HOURS_SCHEDULE,
  describeAiHours,
  hasAnyAiHours,
  isWithinAiHours,
  normalizeAiHoursSchedule,
  type AiHoursDayKey,
  type AiHoursSchedule,
} from "@/lib/ai-hours";
import { useNowMs } from "@/lib/hooks/use-now";
import { cn } from "@/lib/utils";

const DEFAULT_WINDOW = { start: "09:00", end: "18:00" };

/**
 * Weekly editor for when the AI answers. Outside these windows inbound
 * conversations are handed to a human instead.
 */
export function AiHoursEditor({
  enabled,
  schedule,
  offlineMessage,
  onEnabledChange,
  onScheduleChange,
  onOfflineMessageChange,
}: {
  enabled: boolean;
  schedule: AiHoursSchedule | null | undefined;
  offlineMessage: string;
  onEnabledChange: (enabled: boolean) => void;
  onScheduleChange: (schedule: AiHoursSchedule) => void;
  onOfflineMessageChange: (message: string) => void;
}) {
  const nowMs = useNowMs(30_000);
  const value = React.useMemo(() => normalizeAiHoursSchedule(schedule), [schedule]);

  const update = (days: AiHoursSchedule["days"]) =>
    onScheduleChange({ timezone: value.timezone, days });

  const setDayWindows = (day: AiHoursDayKey, windows: AiHoursSchedule["days"][AiHoursDayKey]) => {
    const days = { ...value.days };
    if (!windows || windows.length === 0) {
      delete days[day];
    } else {
      days[day] = windows;
    }
    update(days);
  };

  const toggleDay = (day: AiHoursDayKey, on: boolean) => {
    setDayWindows(day, on ? [{ ...DEFAULT_WINDOW }] : []);
  };

  const copyToWeekdays = () => {
    const source = value.days.mon;
    if (!source?.length) return;
    const days = { ...value.days };
    for (const day of ["tue", "wed", "thu", "fri"] as AiHoursDayKey[]) {
      days[day] = source.map((window) => ({ ...window }));
    }
    update(days);
  };

  const liveStatus = React.useMemo(() => {
    if (!enabled) return null;
    if (!hasAnyAiHours(value)) return "no-hours" as const;
    return isWithinAiHours(value, new Date(nowMs || Date.now())) ? ("on" as const) : ("off" as const);
  }, [enabled, nowMs, value]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            AI answering hours
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Inside these hours the AI replies. Outside them the conversation is switched to
            human mode so a counsellor picks it up.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </div>

      {enabled ? (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {liveStatus === "on" ? (
                <Badge className="border-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                  AI is answering right now
                </Badge>
              ) : liveStatus === "off" ? (
                <Badge className="border-0 bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                  Outside hours — handing to humans
                </Badge>
              ) : (
                <Badge className="border-0 bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                  No hours set — the AI never answers
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">{describeAiHours(value)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                disabled={!value.days.mon?.length}
                onClick={copyToWeekdays}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copy Monday to weekdays
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => onScheduleChange({ ...DEFAULT_AI_HOURS_SCHEDULE })}
              >
                Reset
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {AI_HOURS_DAY_KEYS.map((day) => {
              const windows = value.days[day] ?? [];
              const active = windows.length > 0;
              return (
                <div
                  key={day}
                  className={cn(
                    "flex flex-col gap-2 rounded-md border px-3 py-2 sm:flex-row sm:items-start",
                    !active && "bg-muted/30",
                  )}
                >
                  <div className="flex w-40 shrink-0 items-center gap-2 pt-1">
                    <Switch
                      checked={active}
                      onCheckedChange={(checked) => toggleDay(day, checked)}
                      aria-label={`AI available on ${AI_HOURS_DAY_LABELS[day]}`}
                    />
                    <span className={cn("text-sm", !active && "text-muted-foreground")}>
                      {AI_HOURS_DAY_LABELS[day]}
                    </span>
                  </div>

                  <div className="flex-1 space-y-2">
                    {active ? (
                      windows.map((window, index) => (
                        <div key={index} className="flex flex-wrap items-center gap-2">
                          <Input
                            type="time"
                            className="h-8 w-32"
                            value={window.start}
                            aria-label={`${AI_HOURS_DAY_LABELS[day]} start time`}
                            onChange={(event) => {
                              const next = windows.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, start: event.target.value }
                                  : item,
                              );
                              setDayWindows(day, next);
                            }}
                          />
                          <span className="text-xs text-muted-foreground">to</span>
                          <Input
                            type="time"
                            className="h-8 w-32"
                            value={window.end}
                            aria-label={`${AI_HOURS_DAY_LABELS[day]} end time`}
                            onChange={(event) => {
                              const next = windows.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, end: event.target.value } : item,
                              );
                              setDayWindows(day, next);
                            }}
                          />
                          {windows.length > 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Remove this window"
                              onClick={() =>
                                setDayWindows(
                                  day,
                                  windows.filter((_, itemIndex) => itemIndex !== index),
                                )
                              }
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <p className="pt-1.5 text-xs text-muted-foreground">
                        Humans handle everything on this day.
                      </p>
                    )}

                    {active ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() =>
                          setDayWindows(day, [...windows, { start: "19:00", end: "21:00" }])
                        }
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Add another window
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            Times are in {value.timezone}. An end time earlier than its start crosses midnight
            (for example 22:00 to 02:00).
          </p>

          <div className="grid gap-2">
            <Label>Off-hours auto-reply</Label>
            <Textarea
              rows={2}
              value={offlineMessage}
              onChange={(event) => onOfflineMessageChange(event.target.value)}
              placeholder="We're offline right now. A counsellor will reply during business hours."
            />
            <p className="text-xs text-muted-foreground">
              Sent once when someone messages outside AI hours. Leave blank to stay silent and
              simply hand the chat to a human.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
