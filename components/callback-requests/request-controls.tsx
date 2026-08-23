"use client";

import * as React from "react";
import { AlertTriangle, MapPin, Mail, Phone, Video } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getWhatsAppUrl } from "@/lib/phone";
import {
  STATUS_DOT_STYLES,
  STATUS_STYLES,
} from "@/lib/callback-requests-view";
import {
  APPOINTMENT_MODE_LABELS,
  CALLBACK_REQUEST_STATUS_LABELS,
  CALLBACK_REQUEST_TYPE_LABELS,
  type AppointmentMode,
  type CallbackRequestStatus,
  type CallbackRequestType,
  type Profile,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export const UNASSIGNED = "unassigned";

export function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export function RequestStatusBadge({
  status,
  className,
}: {
  status: CallbackRequestStatus;
  className?: string;
}) {
  return (
    <Badge variant="secondary" className={cn("border-0", STATUS_STYLES[status], className)}>
      {CALLBACK_REQUEST_STATUS_LABELS[status]}
    </Badge>
  );
}

export function RequestTypeBadge({
  type,
  className,
}: {
  type: CallbackRequestType;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-medium",
        type === "appointment"
          ? "border-emerald-200 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300"
          : "border-blue-200 text-blue-700 dark:border-blue-500/40 dark:text-blue-300",
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          type === "appointment" ? "bg-emerald-500" : "bg-blue-500",
        )}
      />
      {CALLBACK_REQUEST_TYPE_LABELS[type]}
    </Badge>
  );
}

export function OverdueBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1 border-0 bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
        className,
      )}
    >
      <AlertTriangle className="h-3 w-3" />
      Overdue
    </Badge>
  );
}

export function AppointmentModeIcon({
  mode,
  className,
}: {
  mode: AppointmentMode | null;
  className?: string;
}) {
  if (mode === "video") return <Video className={cn("h-4 w-4", className)} />;
  if (mode === "campus") return <MapPin className={cn("h-4 w-4", className)} />;
  return <Phone className={cn("h-4 w-4", className)} />;
}

export function appointmentModeLabel(mode: AppointmentMode | null) {
  return mode ? APPOINTMENT_MODE_LABELS[mode] : "Appointment";
}

export function counsellorLabel(
  counsellorId: string | null,
  profiles: Profile[],
  fallback?: { full_name: string | null; email: string } | null,
) {
  if (!counsellorId) return "Unassigned";
  const profile = profiles.find((item) => item.id === counsellorId);
  return profile?.full_name || profile?.email || fallback?.full_name || fallback?.email || "Counsellor";
}

/** Compact counsellor picker that saves the moment a value is chosen. */
export function CounsellorPicker({
  value,
  counsellors,
  onChange,
  disabled,
  className,
  ariaLabel = "Assign counsellor",
}: {
  value: string | null;
  counsellors: Profile[];
  onChange: (counsellorId: string | null) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <Select
      value={value ?? UNASSIGNED}
      disabled={disabled}
      onValueChange={(next) => onChange(next === UNASSIGNED ? null : next)}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          "h-8 text-xs",
          !value && "text-muted-foreground",
          className,
        )}
      >
        <SelectValue placeholder="Unassigned" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
        {counsellors.map((profile) => (
          <SelectItem key={profile.id} value={profile.id}>
            {profile.full_name || profile.email}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Compact status picker with a colour dot, saving on selection. */
export function StatusPicker({
  value,
  onChange,
  disabled,
  className,
}: {
  value: CallbackRequestStatus;
  onChange: (status: CallbackRequestStatus) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => onChange(next as CallbackRequestStatus)}
    >
      <SelectTrigger aria-label="Request status" className={cn("h-8 gap-2 text-xs", className)}>
        <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT_STYLES[value])} />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(CALLBACK_REQUEST_STATUS_LABELS) as CallbackRequestStatus[]).map((status) => (
          <SelectItem key={status} value={status}>
            <span className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", STATUS_DOT_STYLES[status])} />
              {CALLBACK_REQUEST_STATUS_LABELS[status]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ActionButton({
  href,
  label,
  external,
  children,
}: {
  href: string;
  label: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          asChild
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <a
            href={href}
            aria-label={label}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            onClick={(event) => event.stopPropagation()}
          >
            {children}
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Call / WhatsApp / email shortcuts for a request. Requires a TooltipProvider ancestor. */
export function QuickContactActions({
  phone,
  email,
  className,
}: {
  phone: string | null;
  email: string | null;
  className?: string;
}) {
  const whatsAppUrl = phone ? getWhatsAppUrl(phone) : null;
  return (
    <div className={cn("flex items-center", className)}>
      {phone ? (
        <ActionButton href={`tel:${phone}`} label={`Call ${phone}`}>
          <Phone className="h-4 w-4" />
        </ActionButton>
      ) : null}
      {whatsAppUrl ? (
        <ActionButton href={whatsAppUrl} label="Chat on WhatsApp" external>
          <WhatsAppGlyph className="h-4 w-4 text-[#25D366]" />
        </ActionButton>
      ) : null}
      {email ? (
        <ActionButton href={`mailto:${email}`} label={`Email ${email}`}>
          <Mail className="h-4 w-4" />
        </ActionButton>
      ) : null}
    </div>
  );
}
