"use client";

import * as React from "react";
import {
  Bot,
  Brain,
  FileText,
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
import { AiHoursEditor } from "@/components/message-centre/ai-hours-editor";
import { WhatsAppTemplatesManager } from "@/components/message-centre/whatsapp-templates-manager";
import {
  DEFAULT_AI_HOURS_SCHEDULE,
  hasAnyAiHours,
  normalizeAiHoursSchedule,
} from "@/lib/ai-hours";
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
  type AIKnowledge,
  type AISettings,
  useAIAgents,
  useCreateAIAgent,
  useCreateTwilioConnection,
  useAIKnowledge,
  useAISettings,
  useDeleteAIAgent,
  useCreateMessagingPage,
  useDeleteKnowledge,
  useDeleteMessagingPage,
  useDeleteTwilioConnection,
  useMessagingPages,
  useSaveKnowledge,
  useTwilioConnections,
  useUpdateAISettings,
  useUpdateMessagingPage,
  useUpdateTwilioConnection,
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

const EMPTY_KNOWLEDGE: AIKnowledge[] = [];

type KnowledgeEditorState = {
  id: string | null;
  title: string;
  content: string;
  is_active: boolean;
  sort_order: number;
  category: string;
};

function createKnowledgeEditorState(
  knowledgeCount: number,
  categoryFilter: string,
): KnowledgeEditorState {
  return {
    id: null,
    title: "",
    content: "",
    is_active: true,
    sort_order: Math.max(1, knowledgeCount + 1),
    category:
      categoryFilter !== "all"
        ? categoryFilter
        : KNOWLEDGE_CATEGORIES[0]?.value ?? "general",
  };
}

export function MessageCentreSettingsClient() {
  const { data: agents = [] } = useAIAgents();
  const createAgent = useCreateAIAgent();
  const deleteAgent = useDeleteAIAgent();
  const [selectedAgentId, setSelectedAgentId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!agents.length) {
      setSelectedAgentId(null);
      return;
    }
    if (!selectedAgentId || !agents.some((agent) => agent.id === selectedAgentId)) {
      const preferred = agents.find((agent) => agent.is_default) ?? agents[0];
      setSelectedAgentId(preferred?.id ?? null);
    }
  }, [agents, selectedAgentId]);

  const selectedAgent =
    agents.find((agent) => agent.id === selectedAgentId) ?? null;

  const createNewAgent = () => {
    const newName = `AI Agent ${agents.length + 1}`;
    createAgent.mutate(
      {
        name: newName,
        tone: "professional_friendly",
      },
      {
        onSuccess: (agent) => {
          const id =
            typeof agent === "object" && agent && "id" in agent
              ? String(agent.id)
              : null;
          if (id) setSelectedAgentId(id);
          toast.success("AI agent created");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const removeSelectedAgent = () => {
    if (!selectedAgent) return;
    deleteAgent.mutate(selectedAgent.id, {
      onSuccess: () => {
        toast.success("AI agent removed");
        setSelectedAgentId(null);
      },
      onError: (error) => toast.error(error.message),
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agents Workspace</CardTitle>
          <CardDescription>
            Each AI agent has its own persona, prompts, knowledge, and connections.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="grid flex-1 gap-2">
            <Label>Active agent workspace</Label>
            <Select
              value={selectedAgentId ?? ""}
              onValueChange={(value) => setSelectedAgentId(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an AI agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                    {agent.is_default ? " (default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={createNewAgent}
              disabled={createAgent.isPending}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Agent
            </Button>
            <Button
              variant="outline"
              onClick={removeSelectedAgent}
              disabled={
                !selectedAgent ||
                selectedAgent.is_default ||
                deleteAgent.isPending
              }
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      {selectedAgent ? (
        <Tabs defaultValue="agent" className="space-y-6">
      <TabsList className="grid w-full grid-cols-4">
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
        <TabsTrigger value="templates" className="gap-1.5 px-1 sm:gap-2 sm:px-3">
          <FileText className="h-4 w-4 shrink-0" />
          <span className="truncate">Templates</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="agent">
        <AgentSettingsTab agentId={selectedAgent.id} />
      </TabsContent>
      <TabsContent value="knowledge">
        <KnowledgeBaseTab agentId={selectedAgent.id} />
      </TabsContent>
      <TabsContent value="connections">
        <ConnectionsTab agentId={selectedAgent.id} />
      </TabsContent>
      <TabsContent value="templates">
        <WhatsAppTemplatesManager agentId={selectedAgent.id} />
      </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Create your first AI agent to configure Message Centre settings.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─── AI Agent Settings ────────────────────────────────────── */

function AgentSettingsTab({ agentId }: { agentId: string }) {
  const { data: settings } = useAISettings(agentId);
  const updateSettings = useUpdateAISettings();

  const [form, setForm] = React.useState<Partial<AISettings>>({});

  React.useEffect(() => {
    if (!settings) return;
    setForm({
      name: settings.name ?? "Admissions Assistant",
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
      business_hours: normalizeAiHoursSchedule(settings.business_hours),
      offline_message: settings.offline_message ?? "",
      is_active: settings.is_active ?? true,
      is_default: settings.is_default ?? false,
    });
  }, [agentId, settings]);

  const patch = (updates: Partial<AISettings>) =>
    setForm((prev) => ({ ...prev, ...updates }));

  const save = () =>
    updateSettings.mutate({ ...form, agent_id: agentId }, {
      onSuccess: () => toast.success("AI agent settings saved"),
      onError: (err) => toast.error(err.message),
    });

  if (!settings) return <SettingsSkeleton />;

  return (
    <div className="space-y-6">
      {/* Master toggle */}
      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="flex items-center justify-between">
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
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Default website agent</div>
              <div className="text-sm text-muted-foreground">
                Used when a new website chat starts or no channel mapping is found.
              </div>
            </div>
            <Switch
              checked={form.is_default ?? false}
              onCheckedChange={(checked) => {
                if (checked) patch({ is_default: true });
              }}
            />
          </div>
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
                value={form.name ?? ""}
                onChange={(e) => patch({ name: e.target.value })}
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
          <AiHoursEditor
            enabled={form.business_hours_enabled ?? false}
            schedule={form.business_hours}
            offlineMessage={form.offline_message ?? ""}
            onEnabledChange={(checked) =>
              patch({
                business_hours_enabled: checked,
                // Turning hours on with nothing configured would silence the bot.
                business_hours:
                  checked && !hasAnyAiHours(normalizeAiHoursSchedule(form.business_hours))
                    ? DEFAULT_AI_HOURS_SCHEDULE
                    : form.business_hours,
              })
            }
            onScheduleChange={(schedule) => patch({ business_hours: schedule })}
            onOfflineMessageChange={(message) => patch({ offline_message: message })}
          />
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

function KnowledgeBaseTab({ agentId }: { agentId: string }) {
  const { data } = useAIKnowledge(agentId);
  const knowledge = data ?? EMPTY_KNOWLEDGE;
  const saveKnowledge = useSaveKnowledge();
  const deleteKnowledge = useDeleteKnowledge();
  const [searchTerm, setSearchTerm] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all");
  const [selectedKnowledgeId, setSelectedKnowledgeId] = React.useState<string | "new" | null>(
    null,
  );
  const [editorState, setEditorState] = React.useState<KnowledgeEditorState | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const filteredKnowledge = React.useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return knowledge
      .filter((item) => {
        if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
        if (!q) return true;
        return (
          item.title.toLowerCase().includes(q) ||
          item.content.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return a.title.localeCompare(b.title);
      });
  }, [categoryFilter, knowledge, searchTerm]);

  const activeCount = React.useMemo(
    () => knowledge.filter((item) => item.is_active).length,
    [knowledge],
  );

  const selectedKnowledge = React.useMemo(() => {
    if (!selectedKnowledgeId || selectedKnowledgeId === "new") return null;
    return knowledge.find((item) => item.id === selectedKnowledgeId) ?? null;
  }, [knowledge, selectedKnowledgeId]);

  React.useEffect(() => {
    if (selectedKnowledgeId === "new") {
      setEditorState((current) =>
        current?.id === null
          ? current
          : createKnowledgeEditorState(knowledge.length, categoryFilter),
      );
      return;
    }

    if (selectedKnowledge) {
      setEditorState({
        id: selectedKnowledge.id,
        title: selectedKnowledge.title,
        content: selectedKnowledge.content,
        is_active: selectedKnowledge.is_active,
        sort_order: selectedKnowledge.sort_order,
        category: selectedKnowledge.category || "general",
      });
      return;
    }

    const firstMatch = filteredKnowledge[0];
    if (firstMatch) {
      setSelectedKnowledgeId(firstMatch.id);
      return;
    }

    setSelectedKnowledgeId("new");
  }, [categoryFilter, filteredKnowledge, knowledge.length, selectedKnowledge, selectedKnowledgeId]);

  const isEditorDirty = React.useMemo(() => {
    if (!editorState) return false;
    if (!editorState.id) {
      const baseline = createKnowledgeEditorState(knowledge.length, categoryFilter);
      return (
        editorState.title.trim().length > 0 ||
        editorState.content.trim().length > 0 ||
        editorState.category !== baseline.category ||
        editorState.sort_order !== baseline.sort_order ||
        editorState.is_active !== baseline.is_active
      );
    }
    if (!selectedKnowledge) return false;
    return (
      editorState.title !== selectedKnowledge.title ||
      editorState.content !== selectedKnowledge.content ||
      editorState.is_active !== selectedKnowledge.is_active ||
      editorState.sort_order !== selectedKnowledge.sort_order ||
      editorState.category !== selectedKnowledge.category
    );
  }, [categoryFilter, editorState, knowledge.length, selectedKnowledge]);

  const saveEditor = () => {
    if (!editorState) return;
    const title = editorState.title.trim();
    const content = editorState.content.trim();
    if (!title || !content) {
      toast.error("Title and content are required");
      return;
    }

    const payload = {
      agent_id: agentId,
      title,
      content,
      is_active: editorState.is_active,
      sort_order: Math.max(1, Number(editorState.sort_order) || 1),
      category: editorState.category || "general",
    };

    saveKnowledge.mutate(
      editorState.id
        ? {
            id: editorState.id,
            payload,
          }
        : { payload },
      {
        onSuccess: (result) => {
          if (!editorState.id && result && typeof result === "object" && "id" in result) {
            setSelectedKnowledgeId(String(result.id));
          }
          toast.success(editorState.id ? "Knowledge updated" : "Knowledge item created");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const deleteEditor = () => {
    if (!editorState?.id) {
      setSelectedKnowledgeId(filteredKnowledge[0]?.id ?? "new");
      return;
    }
    deleteKnowledge.mutate(editorState.id, {
      onSuccess: () => {
        toast.success("Knowledge removed");
        setConfirmDelete(false);
        setSelectedKnowledgeId(null);
      },
      onError: (error) => toast.error(error.message),
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Brain className="h-4 w-4" />
                Knowledge Base
              </CardTitle>
              <CardDescription>
                Maintain a clean, structured knowledge workspace for this AI agent.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{knowledge.length} total</Badge>
              <Badge variant="outline">{activeCount} active</Badge>
              <Button
                onClick={() => {
                  setSelectedKnowledgeId("new");
                  setEditorState(
                    createKnowledgeEditorState(knowledge.length, categoryFilter),
                  );
                }}
                className="gap-1.5"
                size="sm"
              >
                <Plus className="h-3.5 w-3.5" />
                New Block
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-3">
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search title, content, category..."
              className="md:col-span-2"
            />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {KNOWLEDGE_CATEGORIES.map((category) => (
                  <SelectItem key={category.value} value={category.value}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 lg:grid-cols-[360px,1fr]">
            <div className="space-y-2 rounded-lg border">
              <div className="border-b px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Knowledge records
              </div>
              <div className="max-h-[560px] overflow-y-auto p-2">
                {filteredKnowledge.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No knowledge records match your filters.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {filteredKnowledge.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedKnowledgeId(item.id)}
                        className={`w-full rounded-md border px-3 py-2 text-left transition ${
                          selectedKnowledgeId === item.id
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/40"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{item.title}</span>
                          <Badge variant="outline" className="ml-auto shrink-0 capitalize">
                            {item.category}
                          </Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {item.content}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>Order: {item.sort_order}</span>
                          <span>•</span>
                          <span>{item.is_active ? "Active" : "Inactive"}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border p-4">
              {editorState ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold">
                        {editorState.id ? "Edit knowledge block" : "Create knowledge block"}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {editorState.id
                          ? "Update details and save when ready."
                          : "Draft your new block before creating it."}
                      </p>
                    </div>
                    <Badge variant={isEditorDirty ? "default" : "secondary"}>
                      {isEditorDirty ? "Unsaved changes" : "Saved"}
                    </Badge>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Title</Label>
                      <Input
                        value={editorState.title}
                        onChange={(event) =>
                          setEditorState((prev) =>
                            prev ? { ...prev, title: event.target.value } : prev,
                          )
                        }
                        placeholder="Knowledge block title"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Category</Label>
                      <Select
                        value={editorState.category}
                        onValueChange={(value) =>
                          setEditorState((prev) => (prev ? { ...prev, category: value } : prev))
                        }
                      >
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
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Sort Order</Label>
                      <Input
                        type="number"
                        min={1}
                        value={editorState.sort_order}
                        onChange={(event) =>
                          setEditorState((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  sort_order: Math.max(
                                    1,
                                    Number(event.target.value) || 1,
                                  ),
                                }
                              : prev,
                          )
                        }
                      />
                    </div>
                    <div className="flex items-end">
                      <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                        <Switch
                          checked={editorState.is_active}
                          onCheckedChange={(checked) =>
                            setEditorState((prev) =>
                              prev ? { ...prev, is_active: checked } : prev,
                            )
                          }
                        />
                        <Label className="text-sm">Active in retrieval</Label>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>Knowledge Content</Label>
                    <Textarea
                      rows={12}
                      value={editorState.content}
                      onChange={(event) =>
                        setEditorState((prev) =>
                          prev ? { ...prev, content: event.target.value } : prev,
                        )
                      }
                      placeholder="Write clear, factual guidance the AI should use while replying."
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (editorState.id && selectedKnowledge) {
                          setEditorState({
                            id: selectedKnowledge.id,
                            title: selectedKnowledge.title,
                            content: selectedKnowledge.content,
                            is_active: selectedKnowledge.is_active,
                            sort_order: selectedKnowledge.sort_order,
                            category: selectedKnowledge.category || "general",
                          });
                          return;
                        }
                        setEditorState(
                          createKnowledgeEditorState(knowledge.length, categoryFilter),
                        );
                      }}
                      disabled={!isEditorDirty}
                    >
                      Reset
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (!editorState.id) {
                          setEditorState(
                            createKnowledgeEditorState(knowledge.length, categoryFilter),
                          );
                          return;
                        }
                        setConfirmDelete(true);
                      }}
                      disabled={deleteKnowledge.isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {editorState.id ? "Delete" : "Clear"}
                    </Button>
                    <Button
                      onClick={saveEditor}
                      disabled={!isEditorDirty || saveKnowledge.isPending}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {saveKnowledge.isPending ? "Saving…" : editorState.id ? "Save Changes" : "Create Block"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Select a knowledge block to start editing.
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete knowledge block?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the selected block from this AI agent. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteEditor}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─── Connections (Messenger + WhatsApp) ───────────────── */

function ConnectionsTab({ agentId }: { agentId: string }) {
  const { data: pages = [] } = useMessagingPages(agentId);
  const { data: twilioConnections = [] } = useTwilioConnections(agentId);
  const createPage = useCreateMessagingPage();
  const updatePage = useUpdateMessagingPage();
  const deletePage = useDeleteMessagingPage();
  const createTwilioConnection = useCreateTwilioConnection();
  const updateTwilioConnection = useUpdateTwilioConnection();
  const deleteTwilioConnection = useDeleteTwilioConnection();

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
  const [confirmTwilioDelete, setConfirmTwilioDelete] = React.useState<string | null>(null);
  const [twilioForm, setTwilioForm] = React.useState({
    name: "",
    account_sid: "",
    auth_token: "",
    whatsapp_from: "",
    messaging_service_sid: "",
    description: "",
  });

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
        agent_id: agentId,
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

  const handleCreateTwilioConnection = () => {
    createTwilioConnection.mutate(
      {
        agent_id: agentId,
        name: twilioForm.name,
        account_sid: twilioForm.account_sid,
        auth_token: twilioForm.auth_token,
        whatsapp_from: twilioForm.whatsapp_from || undefined,
        messaging_service_sid: twilioForm.messaging_service_sid || undefined,
        description: twilioForm.description,
      },
      {
        onSuccess: () => {
          toast.success("Twilio connection added");
          setTwilioForm({
            name: "",
            account_sid: "",
            auth_token: "",
            whatsapp_from: "",
            messaging_service_sid: "",
            description: "",
          });
        },
        onError: (error) => toast.error(error.message),
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

      {/* Twilio WhatsApp */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Phone className="h-4 w-4 text-emerald-600" />
                Twilio WhatsApp
              </CardTitle>
              <CardDescription>
                Connect multiple Twilio WhatsApp credential sets for this AI agent.
              </CardDescription>
            </div>
            <Badge variant="outline" className="gap-1">
              {twilioConnections.length} connected
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {twilioConnections.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No Twilio connections for this agent yet.
            </div>
          ) : (
            twilioConnections.map((connection) => (
              <div key={connection.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{connection.name}</span>
                      <Badge variant={connection.is_active ? "outline" : "secondary"}>
                        {connection.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Account SID: {connection.account_sid}
                    </p>
                    {connection.whatsapp_from ? (
                      <p className="text-xs text-muted-foreground">
                        Sender: {connection.whatsapp_from}
                      </p>
                    ) : null}
                    {connection.messaging_service_sid ? (
                      <p className="text-xs text-muted-foreground">
                        Messaging Service: {connection.messaging_service_sid}
                      </p>
                    ) : null}
                    {connection.description ? (
                      <p className="text-xs text-muted-foreground">{connection.description}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={connection.is_active}
                      onCheckedChange={(active) =>
                        updateTwilioConnection.mutate(
                          { id: connection.id, is_active: active },
                          {
                            onSuccess: () => toast.success("Twilio connection updated"),
                            onError: (error) => toast.error(error.message),
                          },
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setConfirmTwilioDelete(connection.id)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}

          <Separator />
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Connection Name</Label>
                <Input
                  value={twilioForm.name}
                  onChange={(event) =>
                    setTwilioForm((previous) => ({
                      ...previous,
                      name: event.target.value,
                    }))
                  }
                  placeholder="e.g. Admissions WA Line 1"
                />
              </div>
              <div className="grid gap-2">
                <Label>Account SID</Label>
                <Input
                  value={twilioForm.account_sid}
                  onChange={(event) =>
                    setTwilioForm((previous) => ({
                      ...previous,
                      account_sid: event.target.value,
                    }))
                  }
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Auth Token</Label>
                <Input
                  type="password"
                  value={twilioForm.auth_token}
                  onChange={(event) =>
                    setTwilioForm((previous) => ({
                      ...previous,
                      auth_token: event.target.value,
                    }))
                  }
                  placeholder="Twilio auth token"
                />
              </div>
              <div className="grid gap-2">
                <Label>WhatsApp Sender (optional)</Label>
                <Input
                  value={twilioForm.whatsapp_from}
                  onChange={(event) =>
                    setTwilioForm((previous) => ({
                      ...previous,
                      whatsapp_from: event.target.value,
                    }))
                  }
                  placeholder="+14155238886"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Messaging Service SID (optional)</Label>
                <Input
                  value={twilioForm.messaging_service_sid}
                  onChange={(event) =>
                    setTwilioForm((previous) => ({
                      ...previous,
                      messaging_service_sid: event.target.value,
                    }))
                  }
                  placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
              </div>
              <div className="grid gap-2">
                <Label>Description (optional)</Label>
                <Input
                  value={twilioForm.description}
                  onChange={(event) =>
                    setTwilioForm((previous) => ({
                      ...previous,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Internal notes"
                />
              </div>
            </div>
            <Button
              onClick={handleCreateTwilioConnection}
              disabled={createTwilioConnection.isPending}
            >
              <Plus className="mr-2 h-4 w-4" />
              {createTwilioConnection.isPending
                ? "Adding Twilio connection…"
                : "Add Twilio Connection"}
            </Button>
          </div>
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

      <AlertDialog
        open={!!confirmTwilioDelete}
        onOpenChange={(open) => !open && setConfirmTwilioDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Twilio connection?</AlertDialogTitle>
            <AlertDialogDescription>
              Existing conversations will stay, but new sends and incoming routing for this
              Twilio connection will stop.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmTwilioDelete) return;
                deleteTwilioConnection.mutate(confirmTwilioDelete, {
                  onSuccess: () => {
                    toast.success("Twilio connection removed");
                    setConfirmTwilioDelete(null);
                  },
                  onError: (error) => toast.error(error.message),
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
