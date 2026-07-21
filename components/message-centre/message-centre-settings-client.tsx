"use client";

import * as React from "react";
import {
  Bot,
  Brain,
  Globe,
  MessageSquare,
  Phone,
  Plus,
  Save,
  Shield,
  Trash2,
  Zap,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
  type AISettings,
  useAIKnowledge,
  useAISettings,
  useCreateMessagingPage,
  useDeleteKnowledge,
  useDeleteMessagingPage,
  useMessagingPages,
  useSaveKnowledge,
  useUpdateAISettings,
  useUpdateMessagingPage,
} from "@/lib/hooks/use-message-centre-settings";
import { WebsiteWidgetSettings } from "@/components/message-centre/website-widget-settings";

const TONE_OPTIONS = [
  { value: "professional_friendly", label: "Professional & Friendly" },
  { value: "formal", label: "Formal" },
  { value: "casual", label: "Casual" },
  { value: "empathetic", label: "Empathetic" },
] as const;

const KNOWLEDGE_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "faq", label: "FAQ" },
  { value: "courses", label: "Courses" },
  { value: "fees", label: "Fees" },
  { value: "admissions", label: "Admissions" },
  { value: "policies", label: "Policies" },
  { value: "custom", label: "Custom" },
] as const;

export function MessageCentreSettingsClient() {
  return (
    <Tabs defaultValue="agent" className="space-y-6">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="agent" className="gap-1.5 px-1 sm:gap-2 sm:px-3">
          <Bot className="h-4 w-4 shrink-0" />
          <span className="truncate">
            <span className="sm:hidden">Agent</span>
            <span className="hidden sm:inline">AI Agent</span>
          </span>
        </TabsTrigger>
        <TabsTrigger value="knowledge" className="gap-1.5 px-1 sm:gap-2 sm:px-3">
          <Brain className="h-4 w-4 shrink-0" />
          <span className="truncate">
            <span className="sm:hidden">Knowledge</span>
            <span className="hidden sm:inline">Knowledge Base</span>
          </span>
        </TabsTrigger>
        <TabsTrigger value="connections" className="gap-1.5 px-1 sm:gap-2 sm:px-3">
          <Globe className="h-4 w-4 shrink-0" />
          <span className="truncate">
            <span className="sm:hidden">Connect</span>
            <span className="hidden sm:inline">Connections</span>
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="agent">
        <AgentSettingsTab />
      </TabsContent>
      <TabsContent value="knowledge">
        <KnowledgeBaseTab />
      </TabsContent>
      <TabsContent value="connections">
        <ConnectionsTab />
      </TabsContent>
    </Tabs>
  );
}

/* ─── AI Agent Settings ────────────────────────────────────── */

function AgentSettingsTab() {
  const { data: settings } = useAISettings();
  const updateSettings = useUpdateAISettings();

  const [form, setForm] = React.useState<Partial<AISettings>>({});
  const initialized = React.useRef(false);

  React.useEffect(() => {
    if (!settings || initialized.current) return;
    initialized.current = true;
    setForm({
      agent_name: settings.agent_name ?? "Admissions Assistant",
      persona: settings.persona ?? "",
      system_prompt: settings.system_prompt ?? "",
      tone: settings.tone ?? "professional_friendly",
      model: settings.model ?? "openai/gpt-4o-mini",
      temperature: settings.temperature ?? 0.7,
      max_tokens: settings.max_tokens ?? 500,
      max_history_messages: settings.max_history_messages ?? 20,
      response_delay_ms: settings.response_delay_ms ?? 0,
      greeting_message: settings.greeting_message ?? "",
      fallback_message: settings.fallback_message ?? "",
      escalation_enabled: settings.escalation_enabled ?? true,
      escalation_keywords: settings.escalation_keywords ?? [],
      escalation_message: settings.escalation_message ?? "",
      auto_collect_lead: settings.auto_collect_lead ?? false,
      lead_collect_fields: settings.lead_collect_fields ?? ["name", "phone", "email", "course"],
      business_hours_enabled: settings.business_hours_enabled ?? false,
      offline_message: settings.offline_message ?? "",
      is_active: settings.is_active ?? true,
    });
  }, [settings]);

  const patch = (updates: Partial<AISettings>) =>
    setForm((prev) => ({ ...prev, ...updates }));

  const save = () =>
    updateSettings.mutate(form, {
      onSuccess: () => toast.success("AI agent settings saved"),
      onError: (err) => toast.error(err.message),
    });

  if (!settings) return <SettingsSkeleton />;

  return (
    <div className="space-y-6">
      {/* Master toggle */}
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className={`rounded-full p-2 ${form.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="font-medium">AI Agent</div>
              <div className="text-sm text-muted-foreground">
                {form.is_active ? "Active — auto-replies to incoming messages" : "Paused — messages won't receive AI replies"}
              </div>
            </div>
          </div>
          <Switch
            checked={form.is_active ?? true}
            onCheckedChange={(checked) => patch({ is_active: checked })}
          />
        </CardContent>
      </Card>

      {/* Identity & Persona */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4" />
            Identity & Persona
          </CardTitle>
          <CardDescription>
            Define who the AI agent is and how it communicates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Agent Name</Label>
              <Input
                value={form.agent_name ?? ""}
                onChange={(e) => patch({ agent_name: e.target.value })}
                placeholder="e.g. Admissions Assistant"
              />
            </div>
            <div className="grid gap-2">
              <Label>Conversation Tone</Label>
              <Select
                value={form.tone ?? "professional_friendly"}
                onValueChange={(v) => patch({ tone: v as AISettings["tone"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Persona / Role Description</Label>
            <Textarea
              rows={4}
              value={form.persona ?? ""}
              onChange={(e) => patch({ persona: e.target.value })}
              placeholder="Describe the agent's personality, expertise, and behavior. E.g.: You are a senior admissions counselor at Edusphere Group with 10 years of experience..."
            />
            <p className="text-xs text-muted-foreground">
              When provided, this overrides the system prompt below.
            </p>
          </div>
          <div className="grid gap-2">
            <Label>System Prompt (Advanced)</Label>
            <Textarea
              rows={6}
              value={form.system_prompt ?? ""}
              onChange={(e) => patch({ system_prompt: e.target.value })}
              placeholder="Raw system prompt sent to the LLM. Leave empty to use persona instead."
            />
          </div>
        </CardContent>
      </Card>

      {/* Messages */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" />
            Messages
          </CardTitle>
          <CardDescription>
            Configure greeting, fallback and offline messages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Greeting Message</Label>
            <Textarea
              rows={2}
              value={form.greeting_message ?? ""}
              onChange={(e) => patch({ greeting_message: e.target.value })}
              placeholder="Hi! Welcome to our admissions team. How can I help you today?"
            />
          </div>
          <div className="grid gap-2">
            <Label>Fallback Message</Label>
            <Textarea
              rows={2}
              value={form.fallback_message ?? ""}
              onChange={(e) => patch({ fallback_message: e.target.value })}
              placeholder="I'm sorry, I couldn't help with that. A counselor will get back to you shortly."
            />
            <p className="text-xs text-muted-foreground">
              Sent when the AI fails or is paused.
            </p>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>Business Hours</Label>
              <p className="text-xs text-muted-foreground">
                Show offline message outside business hours.
              </p>
            </div>
            <Switch
              checked={form.business_hours_enabled ?? false}
              onCheckedChange={(checked) =>
                patch({ business_hours_enabled: checked })
              }
            />
          </div>
          {form.business_hours_enabled ? (
            <div className="grid gap-2">
              <Label>Offline Message</Label>
              <Textarea
                rows={2}
                value={form.offline_message ?? ""}
                onChange={(e) => patch({ offline_message: e.target.value })}
                placeholder="We're currently offline. Leave us a message and we'll reply during business hours."
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Escalation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            Escalation Rules
          </CardTitle>
          <CardDescription>
            Auto-detect when a conversation should be handed off to a human counselor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Escalation</Label>
              <p className="text-xs text-muted-foreground">
                Automatically switch to human mode when trigger keywords are detected.
              </p>
            </div>
            <Switch
              checked={form.escalation_enabled ?? true}
              onCheckedChange={(checked) => patch({ escalation_enabled: checked })}
            />
          </div>
          {form.escalation_enabled ? (
            <>
              <div className="grid gap-2">
                <Label>Trigger Keywords</Label>
                <KeywordInput
                  keywords={form.escalation_keywords ?? []}
                  onChange={(keywords) => patch({ escalation_keywords: keywords })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Escalation Message</Label>
                <Textarea
                  rows={2}
                  value={form.escalation_message ?? ""}
                  onChange={(e) => patch({ escalation_message: e.target.value })}
                  placeholder="I'm connecting you with a human counselor..."
                />
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Lead Collection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4" />
            Lead Collection
          </CardTitle>
          <CardDescription>
            Let the AI proactively ask for contact details to create leads.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-Collect Lead Info</Label>
              <p className="text-xs text-muted-foreground">
                The AI will politely ask for missing lead details during chat.
              </p>
            </div>
            <Switch
              checked={form.auto_collect_lead ?? false}
              onCheckedChange={(checked) => patch({ auto_collect_lead: checked })}
            />
          </div>
          {form.auto_collect_lead ? (
            <div className="grid gap-2">
              <Label>Fields to Collect</Label>
              <KeywordInput
                keywords={form.lead_collect_fields ?? []}
                onChange={(fields) => patch({ lead_collect_fields: fields })}
                placeholder="Add field (e.g. name, phone, email, course)"
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Model Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4" />
            Model Configuration
          </CardTitle>
          <CardDescription>
            Chat model for counsellor replies (OpenRouter model ID). Do not use
            moderation-only models such as{" "}
            <code className="text-xs">nemotron-3.5-content-safety</code> — those
            classify safety, they do not chat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-2">
              <Label>Model</Label>
              <Input
                value={form.model ?? ""}
                onChange={(e) => patch({ model: e.target.value })}
                placeholder="nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"
              />
              <p className="text-xs text-muted-foreground">
                Free NVIDIA chat example:{" "}
                <code className="text-[11px]">
                  nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
                </code>
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Temperature ({form.temperature ?? 0.7})</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={form.temperature ?? 0.7}
                onChange={(e) => patch({ temperature: Number(e.target.value) })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Max Tokens</Label>
              <Input
                type="number"
                min="50"
                max="4000"
                value={form.max_tokens ?? 500}
                onChange={(e) => patch({ max_tokens: Number(e.target.value) })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Context Window</Label>
              <Input
                type="number"
                min="1"
                max="100"
                value={form.max_history_messages ?? 20}
                onChange={(e) =>
                  patch({ max_history_messages: Number(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">Messages sent to AI</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={save} disabled={updateSettings.isPending} size="lg">
          <Save className="mr-2 h-4 w-4" />
          {updateSettings.isPending ? "Saving…" : "Save All Settings"}
        </Button>
      </div>
    </div>
  );
}

/* ─── Knowledge Base ────────────────────────────────────── */

function KnowledgeBaseTab() {
  const { data: knowledge = [] } = useAIKnowledge();
  const saveKnowledge = useSaveKnowledge();

  const grouped = React.useMemo(() => {
    const groups: Record<string, typeof knowledge> = {};
    knowledge.forEach((item) => {
      const cat = item.category || "general";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }, [knowledge]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4" />
            Knowledge Base
          </CardTitle>
          <CardDescription>
            Train your AI agent with domain-specific knowledge. Organize by category
            for better retrieval.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {knowledge.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No knowledge items yet. Add your first knowledge block to train the AI.
            </div>
          ) : (
            Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">
                    {category}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {items.length} {items.length === 1 ? "item" : "items"}
                  </span>
                </div>
                {items.map((item) => (
                  <KnowledgeItem key={item.id} item={item} />
                ))}
              </div>
            ))
          )}
          <Separator />
          <Button
            variant="outline"
            onClick={() =>
              saveKnowledge.mutate(
                {
                  payload: {
                    title: "New knowledge block",
                    content: "Add contextual guidance here.",
                    is_active: true,
                    sort_order: knowledge.length + 1,
                    category: "general",
                  },
                },
                {
                  onSuccess: () => toast.success("Knowledge item created"),
                  onError: (error) => toast.error(error.message),
                },
              )
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Knowledge Block
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function KnowledgeItem({
  item,
}: {
  item: {
    id: string;
    title: string;
    content: string;
    is_active: boolean;
    sort_order: number;
    category: string;
  };
}) {
  const saveKnowledge = useSaveKnowledge();
  const deleteKnowledge = useDeleteKnowledge();
  const [title, setTitle] = React.useState(item.title);
  const [content, setContent] = React.useState(item.content);
  const [isActive, setIsActive] = React.useState(item.is_active);
  const [category, setCategory] = React.useState(item.category || "general");
  const [sortOrder, setSortOrder] = React.useState(String(item.sort_order));

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
        />
        <div className="flex gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KNOWLEDGE_CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="w-20"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            title="Sort order"
          />
        </div>
      </div>
      <Textarea
        rows={4}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Knowledge content..."
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <Label className="text-sm">Active</Label>
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              saveKnowledge.mutate(
                {
                  id: item.id,
                  payload: {
                    title,
                    content,
                    is_active: isActive,
                    sort_order: Number(sortOrder),
                    category,
                  },
                },
                {
                  onSuccess: () => toast.success("Knowledge updated"),
                  onError: (error) => toast.error(error.message),
                },
              )
            }
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            Save
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              deleteKnowledge.mutate(item.id, {
                onSuccess: () => toast.success("Knowledge removed"),
                onError: (error) => toast.error(error.message),
              })
            }
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Connections (Messenger + WhatsApp) ───────────────── */

function ConnectionsTab() {
  const { data: pages = [] } = useMessagingPages();
  const createPage = useCreateMessagingPage();
  const updatePage = useUpdateMessagingPage();
  const deletePage = useDeleteMessagingPage();

  const [showForm, setShowForm] = React.useState(false);
  const [channel, setChannel] = React.useState<"messenger" | "whatsapp">("messenger");
  const [formData, setFormData] = React.useState({
    name: "",
    page_id: "",
    access_token: "",
    phone_number_id: "",
    description: "",
  });
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);

  const messengerPages = pages.filter((p) => p.channel === "messenger");
  const whatsappPages = pages.filter((p) => p.channel === "whatsapp");

  const resetForm = () => {
    setFormData({
      name: "",
      page_id: "",
      access_token: "",
      phone_number_id: "",
      description: "",
    });
    setShowForm(false);
  };

  const handleCreate = () => {
    createPage.mutate(
      {
        ...formData,
        channel,
        phone_number_id: channel === "whatsapp" ? formData.phone_number_id : undefined,
      },
      {
        onSuccess: () => {
          toast.success(`${channel === "whatsapp" ? "WhatsApp" : "Messenger"} connection added`);
          resetForm();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <div className="space-y-6">
      <WebsiteWidgetSettings />

      {/* Messenger */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4 text-blue-600" />
                Facebook Messenger
              </CardTitle>
              <CardDescription>
                Connect Facebook Pages to receive and reply to Messenger conversations.
              </CardDescription>
            </div>
            <Badge variant="outline" className="gap-1">
              {messengerPages.length} connected
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {messengerPages.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No Messenger pages connected. Add one below.
            </div>
          ) : (
            messengerPages.map((page) => (
              <ConnectionCard
                key={page.id}
                page={page}
                onToggle={(active) =>
                  updatePage.mutate(
                    { id: page.id, is_active: active },
                    {
                      onSuccess: () => toast.success("Connection updated"),
                      onError: (err) => toast.error(err.message),
                    },
                  )
                }
                onDelete={() => setConfirmDelete(page.id)}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* WhatsApp */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Phone className="h-4 w-4 text-green-600" />
                WhatsApp Business
              </CardTitle>
              <CardDescription>
                Connect WhatsApp Business numbers to manage conversations.
              </CardDescription>
            </div>
            <Badge variant="outline" className="gap-1">
              {whatsappPages.length} connected
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {whatsappPages.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No WhatsApp numbers connected. Add one below.
            </div>
          ) : (
            whatsappPages.map((page) => (
              <ConnectionCard
                key={page.id}
                page={page}
                onToggle={(active) =>
                  updatePage.mutate(
                    { id: page.id, is_active: active },
                    {
                      onSuccess: () => toast.success("Connection updated"),
                      onError: (err) => toast.error(err.message),
                    },
                  )
                }
                onDelete={() => setConfirmDelete(page.id)}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Add Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add New Connection</CardTitle>
          <CardDescription>
            Connect a new Messenger Page or WhatsApp Business number.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {showForm ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Channel</Label>
                  <Select
                    value={channel}
                    onValueChange={(v) => setChannel(v as "messenger" | "whatsapp")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="messenger">
                        <span className="flex items-center gap-2">
                          <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
                          Messenger
                        </span>
                      </SelectItem>
                      <SelectItem value="whatsapp">
                        <span className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-green-600" />
                          WhatsApp
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Display Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder={
                      channel === "whatsapp"
                        ? "e.g. Main WhatsApp Line"
                        : "e.g. Edusphere College Page"
                    }
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>
                    {channel === "whatsapp" ? "Phone Number ID" : "Page ID"}
                  </Label>
                  <Input
                    value={formData.page_id}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, page_id: e.target.value }))
                    }
                    placeholder={
                      channel === "whatsapp"
                        ? "From Meta Business Suite"
                        : "Facebook Page ID"
                    }
                  />
                </div>
                {channel === "whatsapp" ? (
                  <div className="grid gap-2">
                    <Label>WhatsApp Phone Number ID</Label>
                    <Input
                      value={formData.phone_number_id}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          phone_number_id: e.target.value,
                        }))
                      }
                      placeholder="Phone Number ID from Meta"
                    />
                  </div>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label>Access Token</Label>
                <Input
                  type="password"
                  value={formData.access_token}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, access_token: e.target.value }))
                  }
                  placeholder="Page or WhatsApp access token"
                />
              </div>
              <div className="grid gap-2">
                <Label>Description (optional)</Label>
                <Input
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="Internal notes about this connection"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreate} disabled={createPage.isPending}>
                  <Plus className="mr-2 h-4 w-4" />
                  {createPage.isPending ? "Adding…" : "Add Connection"}
                </Button>
                <Button variant="ghost" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Connection
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove connection?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disconnect the page/number from your CRM. Existing
              conversations will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmDelete) return;
                deletePage.mutate(confirmDelete, {
                  onSuccess: () => {
                    toast.success("Connection removed");
                    setConfirmDelete(null);
                  },
                  onError: (err) => toast.error(err.message),
                });
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ConnectionCard({
  page,
  onToggle,
  onDelete,
}: {
  page: {
    id: string;
    name: string;
    page_id: string;
    phone_number_id: string | null;
    channel: "messenger" | "whatsapp";
    is_active: boolean;
    description: string;
    last_verified_at: string | null;
    created_at: string;
  };
  onToggle: (active: boolean) => void;
  onDelete: () => void;
}) {
  const isMessenger = page.channel === "messenger";

  return (
    <div className="flex items-center gap-4 rounded-lg border p-4">
      <div
        className={`rounded-full p-2 ${
          page.is_active
            ? isMessenger
              ? "bg-blue-50 text-blue-600"
              : "bg-green-50 text-green-600"
            : "bg-gray-100 text-gray-400"
        }`}
      >
        {isMessenger ? (
          <MessageSquare className="h-5 w-5" />
        ) : (
          <Phone className="h-5 w-5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{page.name}</span>
          {page.is_active ? (
            <Badge
              variant="outline"
              className="gap-1 border-green-200 bg-green-50 text-green-700"
            >
              <CheckCircle2 className="h-3 w-3" />
              Active
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="gap-1 border-gray-200 text-gray-500"
            >
              <XCircle className="h-3 w-3" />
              Inactive
            </Badge>
          )}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {isMessenger ? "Page" : "Phone"} ID: {page.page_id}
          {page.phone_number_id
            ? ` · Phone Number ID: ${page.phone_number_id}`
            : ""}
        </div>
        {page.description ? (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {page.description}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={page.is_active} onCheckedChange={onToggle} />
        <Button variant="ghost" size="icon" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}

/* ─── Shared components ──────────────────────────────────── */

function KeywordInput({
  keywords,
  onChange,
  placeholder,
}: {
  keywords: string[];
  onChange: (keywords: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = React.useState("");

  const addKeyword = () => {
    const trimmed = input.trim().toLowerCase();
    if (trimmed && !keywords.includes(trimmed)) {
      onChange([...keywords, trimmed]);
    }
    setInput("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {keywords.map((kw) => (
          <Badge
            key={kw}
            variant="secondary"
            className="cursor-pointer gap-1 pr-1"
            onClick={() => onChange(keywords.filter((k) => k !== kw))}
          >
            {kw}
            <XCircle className="h-3 w-3" />
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addKeyword();
            }
          }}
          placeholder={placeholder ?? "Type a keyword and press Enter"}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addKeyword}
          disabled={!input.trim()}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="py-8">
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
            <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
