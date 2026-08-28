"use client";

import * as React from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Search, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversations } from "@/lib/hooks/use-conversations";
import { useLeads } from "@/lib/hooks/use-leads";
import { useProfiles } from "@/lib/hooks/use-profiles";
import { useTwilioConnections } from "@/lib/hooks/use-message-centre-settings";
import { useWhatsAppTemplates } from "@/lib/hooks/use-whatsapp-templates";
import { useCreateCampaign, useSendCampaign } from "@/lib/hooks/use-campaigns";
import {
  CAMPAIGN_LEAD_FIELDS,
  extractTemplateVariableKeys,
  renderTemplateBody,
  type CampaignVariableMapping,
} from "@/lib/campaigns";
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  PIPELINE_LEAD_STATUSES,
  isAssignableCounsellor,
  type LeadSource,
  type LeadStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type AudienceSource = "leads" | "conversations";

type Step = "setup" | "audience" | "personalise" | "review";

const STEPS: Array<{ key: Step; label: string }> = [
  { key: "setup", label: "Template" },
  { key: "audience", label: "Audience" },
  { key: "personalise", label: "Personalise" },
  { key: "review", label: "Review" },
];

type Recipient = {
  id: string;
  name: string;
  phone: string;
  detail: string;
  fields: Record<string, string>;
};

export function CampaignBuilder({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = React.useState<Step>("setup");
  const [name, setName] = React.useState("");
  const [connectionId, setConnectionId] = React.useState("");
  const [contentSid, setContentSid] = React.useState("");
  const [source, setSource] = React.useState<AudienceSource>("leads");
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [mapping, setMapping] = React.useState<CampaignVariableMapping>({});
  const [sendCap, setSendCap] = React.useState("");
  const [skipRecentDays, setSkipRecentDays] = React.useState("7");
  const [costPerMessage, setCostPerMessage] = React.useState("");
  const [confirmText, setConfirmText] = React.useState("");

  // Lead audience filters
  const [search, setSearch] = React.useState("");
  const [statuses, setStatuses] = React.useState<LeadStatus[]>([]);
  const [sources, setSources] = React.useState<LeadSource[]>([]);
  const [counsellorIds, setCounsellorIds] = React.useState<string[]>([]);

  const { data: connections = [] } = useTwilioConnections();
  const { data: profiles = [] } = useProfiles();
  const createCampaign = useCreateCampaign();
  const sendCampaign = useSendCampaign();

  React.useEffect(() => {
    if (!connectionId && connections.length) setConnectionId(connections[0].id);
  }, [connectionId, connections]);

  React.useEffect(() => {
    if (open) return;
    setStep("setup");
    setName("");
    setContentSid("");
    setSelectedIds([]);
    setMapping({});
    setConfirmText("");
    setSearch("");
    setStatuses([]);
    setSources([]);
    setCounsellorIds([]);
  }, [open]);

  const { data: templates = [], isLoading: templatesLoading } = useWhatsAppTemplates(
    connectionId || null,
    open && Boolean(connectionId),
  );
  const approvedTemplates = React.useMemo(
    () => templates.filter((template) => template.approvalStatus === "approved"),
    [templates],
  );
  const template = approvedTemplates.find((item) => item.sid === contentSid) ?? null;

  const { data: leads = [], isLoading: leadsLoading } = useLeads({
    search: search.trim() || undefined,
    statuses: statuses.length ? statuses : undefined,
    sources: sources.length ? sources : undefined,
    counsellorIds: counsellorIds.length ? counsellorIds : undefined,
    enabled: open && source === "leads",
  });

  const { data: conversations = [], isLoading: conversationsLoading } = useConversations({
    channel: "whatsapp",
    provider: "twilio",
    status: "all",
  });

  const counsellorNameById = React.useMemo(
    () =>
      new Map(
        profiles.map((profile) => [profile.id, profile.full_name || profile.email || ""]),
      ),
    [profiles],
  );

  const recipients: Recipient[] = React.useMemo(() => {
    if (source === "leads") {
      return leads
        .filter((lead) => lead.phone && !lead.do_not_contact)
        .map((lead) => ({
          id: lead.id,
          name: lead.full_name,
          phone: lead.phone,
          detail: lead.interested_course || LEAD_STATUS_LABELS[lead.status] || "",
          fields: {
            full_name: lead.full_name ?? "",
            first_name: lead.first_name || (lead.full_name ?? "").split(" ")[0] || "",
            phone: lead.phone ?? "",
            email: lead.email ?? "",
            city: lead.city ?? "",
            nationality: lead.nationality ?? "",
            interested_course: lead.interested_course ?? "",
            counsellor_name: lead.assigned_counsellor
              ? (counsellorNameById.get(lead.assigned_counsellor) ?? "")
              : "",
            status_label: lead.status ? (LEAD_STATUS_LABELS[lead.status] ?? "") : "",
          },
        }));
    }

    const term = search.trim().toLowerCase();
    return conversations
      .filter((conversation) => conversation.phone || conversation.external_user_id)
      .filter((conversation) =>
        term
          ? [conversation.name, conversation.phone, conversation.external_user_id]
              .filter(Boolean)
              .some((value) => value!.toLowerCase().includes(term))
          : true,
      )
      .map((conversation) => ({
        id: conversation.id,
        name: conversation.name || conversation.phone || conversation.external_user_id,
        phone: conversation.phone || conversation.external_user_id,
        detail: conversation.last_message_preview?.slice(0, 60) || "No messages yet",
        fields: {
          full_name: conversation.name ?? "",
          first_name: (conversation.name ?? "").split(" ")[0] ?? "",
          phone: conversation.phone || conversation.external_user_id,
          email: "",
          city: "",
          nationality: "",
          interested_course: "",
          counsellor_name: "",
          status_label: "",
        },
      }));
  }, [conversations, counsellorNameById, leads, search, source]);

  const selectedRecipients = React.useMemo(
    () => recipients.filter((recipient) => selectedIds.includes(recipient.id)),
    [recipients, selectedIds],
  );

  const variables = React.useMemo(
    () => extractTemplateVariableKeys(template?.body) ,
    [template],
  );

  // Seed unmapped variables so the personalise step starts somewhere sensible.
  React.useEffect(() => {
    if (!variables.length) return;
    setMapping((current) => {
      const next = { ...current };
      let changed = false;
      for (const variable of variables) {
        if (!next[variable]) {
          next[variable] = { source: "lead_field", value: "full_name" };
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [variables]);

  const previewRecipient = selectedRecipients[0] ?? recipients[0] ?? null;
  const previewVariables = React.useMemo(() => {
    const resolved: Record<string, string> = {};
    for (const [key, binding] of Object.entries(mapping)) {
      resolved[key] =
        binding.source === "static"
          ? binding.value
          : (previewRecipient?.fields[binding.value] ?? "");
    }
    return resolved;
  }, [mapping, previewRecipient]);

  const cap = Number(sendCap);
  const effectiveCount =
    Number.isFinite(cap) && cap > 0
      ? Math.min(cap, selectedRecipients.length)
      : selectedRecipients.length;
  const rate = Number(costPerMessage);
  const estimatedCost = Number.isFinite(rate) && rate > 0 ? rate * effectiveCount : null;

  // A lead-field binding that resolves to nothing makes Twilio reject that
  // single message, so surface the count before the send rather than after.
  const blankValueWarnings = React.useMemo(() => {
    const warnings: Array<{ variable: string; field: string; count: number }> = [];
    for (const [variable, binding] of Object.entries(mapping)) {
      if (binding.source !== "lead_field") continue;
      const count = selectedRecipients.filter(
        (recipient) => !(recipient.fields[binding.value] ?? "").trim(),
      ).length;
      if (count > 0) warnings.push({ variable, field: binding.value, count });
    }
    return warnings;
  }, [mapping, selectedRecipients]);

  const unmappedVariables = variables.filter((variable) => {
    const binding = mapping[variable];
    if (!binding) return true;
    return binding.source === "static" && !binding.value.trim();
  });

  const canContinue = (() => {
    if (step === "setup") return Boolean(name.trim() && connectionId && contentSid);
    if (step === "audience") return selectedRecipients.length > 0;
    if (step === "personalise") return unmappedVariables.length === 0;
    return confirmText.trim().toUpperCase() === "SEND";
  })();

  const goNext = () => {
    const index = STEPS.findIndex((item) => item.key === step);
    if (index < STEPS.length - 1) setStep(STEPS[index + 1].key);
  };
  const goBack = () => {
    const index = STEPS.findIndex((item) => item.key === step);
    if (index > 0) setStep(STEPS[index - 1].key);
  };

  const buildPayload = () => ({
    name: name.trim(),
    twilioConnectionId: connectionId,
    contentSid,
    templateName: template?.friendlyName ?? "",
    templateLanguage: template?.language ?? "en",
    templateBody: template?.body ?? null,
    variableMapping: mapping,
    audience: {
      source,
      leadIds: source === "leads" ? selectedRecipients.map((item) => item.id) : undefined,
      conversationIds:
        source === "conversations" ? selectedRecipients.map((item) => item.id) : undefined,
      description:
        source === "leads"
          ? describeLeadFilters({ search, statuses, sources, counsellorIds, counsellorNameById })
          : "Selected WhatsApp conversations",
    },
    sendCap: Number.isFinite(cap) && cap > 0 ? cap : null,
    skipRecentDays: Number(skipRecentDays) > 0 ? Number(skipRecentDays) : null,
    costPerMessage: Number.isFinite(rate) && rate > 0 ? rate : 0,
  });

  const submit = (startSending: boolean) => {
    createCampaign.mutate(buildPayload(), {
      onSuccess: (result) => {
        onOpenChange(false);
        if (startSending) {
          sendCampaign.mutate(result.campaign.id);
        }
      },
    });
  };

  const isBusy = createCampaign.isPending || sendCampaign.isPending;
  const listLoading = source === "leads" ? leadsLoading : conversationsLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New WhatsApp campaign</DialogTitle>
          <DialogDescription>
            Bulk sends use an approved WhatsApp template, personalised per recipient.
          </DialogDescription>
        </DialogHeader>

        <ol className="flex flex-wrap items-center gap-2 border-b pb-3 text-xs">
          {STEPS.map((item, index) => {
            const currentIndex = STEPS.findIndex((entry) => entry.key === step);
            const done = index < currentIndex;
            const active = item.key === step;
            return (
              <li key={item.key} className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium",
                    active
                      ? "bg-primary text-primary-foreground"
                      : done
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className={cn(active ? "font-medium" : "text-muted-foreground")}>
                  {item.label}
                </span>
                {index < STEPS.length - 1 ? (
                  <span className="text-muted-foreground">/</span>
                ) : null}
              </li>
            );
          })}
        </ol>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {step === "setup" ? (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label>Campaign name</Label>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="August intake reminder"
                />
              </div>

              <div className="grid gap-2">
                <Label>Send from</Label>
                <Select value={connectionId} onValueChange={setConnectionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a Twilio connection" />
                  </SelectTrigger>
                  <SelectContent>
                    {connections.map((connection) => (
                      <SelectItem key={connection.id} value={connection.id}>
                        {connection.name}
                        {connection.whatsapp_from ? ` · ${connection.whatsapp_from}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {connections.length === 0 ? (
                  <p className="text-xs text-destructive">
                    Add a Twilio connection in Message Centre settings first.
                  </p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label>Approved template</Label>
                {templatesLoading ? (
                  <Skeleton className="h-10" />
                ) : approvedTemplates.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    No approved templates on this connection. Create one under Settings →
                    Templates and wait for WhatsApp approval.
                  </p>
                ) : (
                  <Select value={contentSid} onValueChange={setContentSid}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a template" />
                    </SelectTrigger>
                    <SelectContent>
                      {approvedTemplates.map((item) => (
                        <SelectItem key={item.sid} value={item.sid}>
                          {item.friendlyName} ({item.language})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {template ? (
                <div className="rounded-md border bg-muted/40 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Template preview</p>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm">{template.body}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === "audience" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={source === "leads" ? "default" : "outline"}
                  onClick={() => {
                    setSource("leads");
                    setSelectedIds([]);
                  }}
                >
                  Leads
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={source === "conversations" ? "default" : "outline"}
                  onClick={() => {
                    setSource("conversations");
                    setSelectedIds([]);
                  }}
                >
                  WhatsApp conversations
                </Button>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={
                    source === "leads" ? "Search leads" : "Search conversations by name or number"
                  }
                />
              </div>

              {source === "leads" ? (
                <div className="flex flex-wrap gap-2">
                  <MultiSelectFilter
                    placeholder="Status"
                    options={PIPELINE_LEAD_STATUSES.map((status) => ({
                      value: status,
                      label: LEAD_STATUS_LABELS[status],
                    }))}
                    selected={statuses}
                    onChange={(values) => setStatuses(values as LeadStatus[])}
                  />
                  <MultiSelectFilter
                    placeholder="Source"
                    options={(Object.keys(LEAD_SOURCE_LABELS) as LeadSource[]).map((value) => ({
                      value,
                      label: LEAD_SOURCE_LABELS[value],
                    }))}
                    selected={sources}
                    onChange={(values) => setSources(values as LeadSource[])}
                  />
                  <MultiSelectFilter
                    placeholder="Counsellor"
                    options={profiles
                      .filter(isAssignableCounsellor)
                      .map((profile) => ({
                        value: profile.id,
                        label: profile.full_name || profile.email,
                      }))}
                    selected={counsellorIds}
                    onChange={setCounsellorIds}
                  />
                </div>
              ) : null}

              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={
                      recipients.length > 0 && selectedIds.length === recipients.length
                    }
                    aria-label="Select everyone in this list"
                    onCheckedChange={(checked) =>
                      setSelectedIds(checked ? recipients.map((item) => item.id) : [])
                    }
                  />
                  <span>
                    {selectedIds.length
                      ? `${selectedIds.length} selected`
                      : `Select all ${recipients.length}`}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {recipients.length} contactable
                </span>
              </div>

              <div className="max-h-72 overflow-y-auto rounded-md border">
                {listLoading ? (
                  <div className="space-y-2 p-3">
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                  </div>
                ) : recipients.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center">
                    <Users className="mb-2 h-6 w-6 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      No contactable recipients match these filters.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y">
                    {recipients.map((recipient) => (
                      <li key={recipient.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50">
                          <Checkbox
                            checked={selectedIds.includes(recipient.id)}
                            onCheckedChange={(checked) =>
                              setSelectedIds((current) =>
                                checked
                                  ? [...current, recipient.id]
                                  : current.filter((id) => id !== recipient.id),
                              )
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{recipient.name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {recipient.phone} · {recipient.detail}
                            </div>
                          </div>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Contacts flagged as do-not-contact are hidden here, and anyone who replied STOP
                is skipped again at send time.
              </p>
            </div>
          ) : null}

          {step === "personalise" ? (
            <div className="space-y-4">
              {variables.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  This template has no variables — every recipient gets the same text.
                </p>
              ) : (
                <div className="space-y-3">
                  {variables.map((variable) => {
                    const binding = mapping[variable] ?? {
                      source: "lead_field" as const,
                      value: "full_name",
                    };
                    return (
                      <div
                        key={variable}
                        className="grid gap-2 rounded-md border p-3 sm:grid-cols-[80px_1fr_1fr] sm:items-center"
                      >
                        <span className="font-mono text-xs">{`{{${variable}}}`}</span>
                        <Select
                          value={binding.source}
                          onValueChange={(value) =>
                            setMapping((current) => ({
                              ...current,
                              [variable]:
                                value === "static"
                                  ? { source: "static", value: "" }
                                  : { source: "lead_field", value: "full_name" },
                            }))
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lead_field">Lead field</SelectItem>
                            <SelectItem value="static">Fixed text</SelectItem>
                          </SelectContent>
                        </Select>
                        {binding.source === "lead_field" ? (
                          <Select
                            value={binding.value}
                            onValueChange={(value) =>
                              setMapping((current) => ({
                                ...current,
                                [variable]: { source: "lead_field", value },
                              }))
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CAMPAIGN_LEAD_FIELDS.map((field) => (
                                <SelectItem key={field.value} value={field.value}>
                                  {field.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            className="h-9"
                            value={binding.value}
                            onChange={(event) =>
                              setMapping((current) => ({
                                ...current,
                                [variable]: { source: "static", value: event.target.value },
                              }))
                            }
                            placeholder="Fixed text"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Preview {previewRecipient ? `for ${previewRecipient.name}` : ""}
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm">
                  {renderTemplateBody(template?.body, previewVariables)}
                </p>
              </div>

              {unmappedVariables.length ? (
                <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Fill in every fixed-text value before continuing.
                </p>
              ) : null}

              {blankValueWarnings.length ? (
                <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs dark:border-amber-500/40 dark:bg-amber-500/10">
                  <p className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Some recipients have no value for a mapped field
                  </p>
                  <ul className="mt-1 space-y-0.5 text-amber-800/80 dark:text-amber-200/80">
                    {blankValueWarnings.map((warning) => (
                      <li key={warning.variable}>
                        {`{{${warning.variable}}}`} → {warning.field}: {warning.count} blank
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-amber-800/80 dark:text-amber-200/80">
                    WhatsApp rejects empty variables, so those messages will fail. Use fixed
                    text, or narrow the audience.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === "review" ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <ReviewRow label="Campaign" value={name} />
                <ReviewRow label="Template" value={template?.friendlyName ?? contentSid} />
                <ReviewRow
                  label="Recipients selected"
                  value={String(selectedRecipients.length)}
                />
                <ReviewRow
                  label="Will send to"
                  value={`${effectiveCount} contact${effectiveCount === 1 ? "" : "s"}`}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label className="text-xs">Send cap</Label>
                  <Input
                    className="h-9"
                    inputMode="numeric"
                    value={sendCap}
                    onChange={(event) => setSendCap(event.target.value.replace(/\D/g, ""))}
                    placeholder="No cap"
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs">Skip messaged in last (days)</Label>
                  <Input
                    className="h-9"
                    inputMode="numeric"
                    value={skipRecentDays}
                    onChange={(event) => setSkipRecentDays(event.target.value.replace(/\D/g, ""))}
                    placeholder="0"
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs">Cost per message</Label>
                  <Input
                    className="h-9"
                    inputMode="decimal"
                    value={costPerMessage}
                    onChange={(event) => setCostPerMessage(event.target.value)}
                    placeholder="0.0085"
                  />
                </div>
              </div>

              {estimatedCost !== null ? (
                <div className="rounded-md border bg-muted/40 p-3 text-sm">
                  Estimated spend:{" "}
                  <span className="font-medium">
                    {estimatedCost.toFixed(2)} for {effectiveCount} messages
                  </span>
                  <span className="ml-1 text-xs text-muted-foreground">
                    (your Twilio and WhatsApp rates decide the real figure)
                  </span>
                </div>
              ) : null}

              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-xs font-medium text-muted-foreground">Message preview</p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm">
                  {renderTemplateBody(template?.body, previewVariables)}
                </p>
              </div>

              <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
                <p className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4" />
                  This sends real WhatsApp messages
                </p>
                <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-200/80">
                  Opt-outs and duplicates are removed automatically. Type SEND to confirm.
                </p>
                <Input
                  className="mt-2 h-9 bg-background"
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  placeholder="SEND"
                />
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t pt-3 sm:justify-between">
          <div>
            {step !== "setup" ? (
              <Button variant="ghost" onClick={goBack} disabled={isBusy}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {step === "audience" && selectedRecipients.length ? (
              <Badge variant="secondary">{selectedRecipients.length} selected</Badge>
            ) : null}
            {step === "review" ? (
              <>
                <Button variant="outline" disabled={isBusy} onClick={() => submit(false)}>
                  Save as draft
                </Button>
                <Button disabled={!canContinue || isBusy} onClick={() => submit(true)}>
                  {isBusy ? "Starting…" : `Send to ${effectiveCount}`}
                </Button>
              </>
            ) : (
              <Button disabled={!canContinue} onClick={goNext}>
                Continue
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium">{value || "—"}</p>
    </div>
  );
}

function describeLeadFilters(input: {
  search: string;
  statuses: LeadStatus[];
  sources: LeadSource[];
  counsellorIds: string[];
  counsellorNameById: Map<string, string>;
}) {
  const parts: string[] = [];
  if (input.search.trim()) parts.push(`search "${input.search.trim()}"`);
  if (input.statuses.length) {
    parts.push(`status ${input.statuses.map((s) => LEAD_STATUS_LABELS[s]).join(", ")}`);
  }
  if (input.sources.length) {
    parts.push(`source ${input.sources.map((s) => LEAD_SOURCE_LABELS[s]).join(", ")}`);
  }
  if (input.counsellorIds.length) {
    parts.push(
      `counsellor ${input.counsellorIds
        .map((id) => input.counsellorNameById.get(id) || id)
        .join(", ")}`,
    );
  }
  return parts.length ? `Leads · ${parts.join(" · ")}` : "All leads";
}
