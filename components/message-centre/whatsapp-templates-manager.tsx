"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Info,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useTwilioConnections } from "@/lib/hooks/use-message-centre-settings";
import {
  useCreateWhatsAppTemplate,
  useDeleteWhatsAppTemplate,
  useSubmitTemplateForApproval,
  useWhatsAppTemplates,
  type TemplateApprovalStatus,
  type WhatsAppTemplate,
} from "@/lib/hooks/use-whatsapp-templates";
import { extractTemplateVariableKeys } from "@/lib/campaigns";
import { cn } from "@/lib/utils";

const CATEGORIES = ["UTILITY", "MARKETING", "AUTHENTICATION"] as const;
type Category = (typeof CATEGORIES)[number];

const STATUS_STYLES: Record<TemplateApprovalStatus, string> = {
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  received: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  rejected: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  unsubmitted: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  unknown: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
};

const STATUS_LABELS: Record<TemplateApprovalStatus, string> = {
  approved: "Approved",
  pending: "Pending approval",
  received: "Submitted",
  rejected: "Rejected",
  unsubmitted: "Draft",
  unknown: "Unknown",
};

function toWhatsAppName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function WhatsAppTemplatesManager({ agentId }: { agentId: string }) {
  const { data: connections = [] } = useTwilioConnections(agentId);
  const [connectionId, setConnectionId] = React.useState<string>("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<WhatsAppTemplate | null>(null);
  const [approvalTarget, setApprovalTarget] = React.useState<WhatsAppTemplate | null>(null);

  React.useEffect(() => {
    if (!connectionId && connections.length) setConnectionId(connections[0].id);
  }, [connectionId, connections]);

  const activeConnectionId = connectionId || null;
  const {
    data: templates = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useWhatsAppTemplates(activeConnectionId, Boolean(activeConnectionId) || !connections.length);

  const deleteTemplate = useDeleteWhatsAppTemplate();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              WhatsApp templates
            </CardTitle>
            <CardDescription>
              Business-initiated WhatsApp messages must use a template approved by Meta.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              aria-label="Refresh templates"
              disabled={isFetching}
              onClick={() => refetch()}
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New template
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {connections.length > 1 ? (
            <div className="grid gap-2 sm:max-w-sm">
              <Label>Twilio connection</Label>
              <Select value={connectionId} onValueChange={setConnectionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a connection" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      {connection.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Twilio content templates cannot be edited once created. To change wording, create
              a new template and delete the old one — the new version needs its own WhatsApp
              approval, which usually takes a few minutes but can take up to a day.
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error.message}
            </div>
          ) : templates.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No templates on this Twilio account yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {templates.map((template) => (
                <li key={template.sid} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{template.friendlyName}</span>
                        <Badge
                          variant="secondary"
                          className={cn("border-0", STATUS_STYLES[template.approvalStatus])}
                        >
                          {STATUS_LABELS[template.approvalStatus]}
                        </Badge>
                        <Badge variant="outline">{template.language}</Badge>
                        {template.category ? (
                          <Badge variant="outline">{template.category}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">
                        {template.body || "No text body"}
                      </p>
                      {template.rejectionReason ? (
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {template.rejectionReason}
                        </p>
                      ) : null}
                      <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                        {template.sid}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {template.approvalStatus === "approved" ? (
                        <span className="flex items-center gap-1 px-2 text-xs text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Sendable
                        </span>
                      ) : template.approvalStatus === "pending" ||
                        template.approvalStatus === "received" ? (
                        <span className="flex items-center gap-1 px-2 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          Waiting on Meta
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => setApprovalTarget(template)}
                        >
                          <Send className="mr-1.5 h-3.5 w-3.5" />
                          Submit
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        aria-label={`Delete ${template.friendlyName}`}
                        onClick={() => setDeleteTarget(template)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <CreateTemplateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        connectionId={activeConnectionId}
      />

      <SubmitApprovalDialog
        template={approvalTarget}
        connectionId={activeConnectionId}
        onClose={() => setApprovalTarget(null)}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.friendlyName} will be removed from Twilio permanently. Campaigns
              that already used it keep their record, but it can no longer be sent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteTarget) return;
                deleteTemplate.mutate({
                  connectionId: activeConnectionId,
                  contentSid: deleteTarget.sid,
                });
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateTemplateDialog({
  open,
  onOpenChange,
  connectionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string | null;
}) {
  const createTemplate = useCreateWhatsAppTemplate();
  const [friendlyName, setFriendlyName] = React.useState("");
  const [language, setLanguage] = React.useState("en");
  const [body, setBody] = React.useState("");
  const [category, setCategory] = React.useState<Category>("MARKETING");
  const [submitForApproval, setSubmitForApproval] = React.useState(true);
  const [samples, setSamples] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) {
      setFriendlyName("");
      setLanguage("en");
      setBody("");
      setCategory("MARKETING");
      setSubmitForApproval(true);
      setSamples({});
    }
  }, [open]);

  const variables = React.useMemo(() => extractTemplateVariableKeys(body), [body]);
  const approvalName = toWhatsAppName(friendlyName);
  const canSubmit = friendlyName.trim() !== "" && body.trim() !== "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New WhatsApp template</DialogTitle>
          <DialogDescription>
            Use {"{{1}}"}, {"{{2}}"} … for the parts that change per recipient. You map those to
            lead fields when you build a campaign.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Template name</Label>
              <Input
                value={friendlyName}
                onChange={(event) => setFriendlyName(event.target.value)}
                placeholder="Open house invitation"
              />
              {approvalName ? (
                <p className="text-xs text-muted-foreground">
                  Submitted to WhatsApp as{" "}
                  <span className="font-mono">{approvalName}</span>
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label>Language</Label>
              <Input
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                placeholder="en"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Message body</Label>
            <Textarea
              rows={5}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Hi {{1}}, our next intake for {{2}} opens soon. Reply here to book a counselling session."
            />
            <p className="text-xs text-muted-foreground">{body.length}/1024 characters</p>
          </div>

          {variables.length ? (
            <div className="grid gap-2 rounded-md border p-3">
              <Label className="text-xs">Sample values</Label>
              <p className="text-xs text-muted-foreground">
                WhatsApp reviewers see these examples. They are not used when sending.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {variables.map((variable) => (
                  <div key={variable} className="grid gap-1">
                    <Label className="text-xs font-mono">{`{{${variable}}}`}</Label>
                    <Input
                      className="h-8"
                      value={samples[variable] ?? ""}
                      onChange={(event) =>
                        setSamples((current) => ({ ...current, [variable]: event.target.value }))
                      }
                      placeholder="Example"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label>Submit to WhatsApp for approval</Label>
              <p className="text-xs text-muted-foreground">
                Required before the template can be sent. Leave off to keep it as a draft.
              </p>
            </div>
            <Switch checked={submitForApproval} onCheckedChange={setSubmitForApproval} />
          </div>

          {submitForApproval ? (
            <div className="grid gap-2 sm:max-w-xs">
              <Label>Category</Label>
              <Select value={category} onValueChange={(value) => setCategory(value as Category)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Promotional messages must be MARKETING. Misclassifying gets templates rejected.
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || createTemplate.isPending}
            onClick={() =>
              createTemplate.mutate(
                {
                  connectionId,
                  friendlyName: friendlyName.trim(),
                  language: language.trim() || "en",
                  body: body.trim(),
                  variableSamples: samples,
                  submitForApproval,
                  approvalName,
                  category: submitForApproval ? category : undefined,
                },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            {createTemplate.isPending ? "Creating…" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubmitApprovalDialog({
  template,
  connectionId,
  onClose,
}: {
  template: WhatsAppTemplate | null;
  connectionId: string | null;
  onClose: () => void;
}) {
  const submitApproval = useSubmitTemplateForApproval();
  const [category, setCategory] = React.useState<Category>("MARKETING");
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    if (template) {
      setName(template.approvalName || toWhatsAppName(template.friendlyName));
      setCategory((template.category as Category) || "MARKETING");
    }
  }, [template]);

  return (
    <Dialog open={Boolean(template)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit for WhatsApp approval</DialogTitle>
          <DialogDescription>
            Meta reviews the wording before this template can be sent to contacts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>WhatsApp template name</Label>
            <Input
              value={name}
              onChange={(event) => setName(toWhatsAppName(event.target.value))}
              placeholder="open_house_invitation"
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, and underscores only.
            </p>
          </div>
          <div className="grid gap-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as Category)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name || submitApproval.isPending}
            onClick={() => {
              if (!template) return;
              submitApproval.mutate(
                { connectionId, contentSid: template.sid, approvalName: name, category },
                { onSuccess: onClose },
              );
            }}
          >
            {submitApproval.isPending ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
