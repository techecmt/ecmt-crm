"use client";

import * as React from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  useAIKnowledge,
  useAISettings,
  useCreateMessagingPage,
  useDeleteKnowledge,
  useMessagingPages,
  useSaveKnowledge,
  useUpdateAISettings,
} from "@/lib/hooks/use-message-centre-settings";

export function MessageCentreSettingsClient() {
  const { data: settings } = useAISettings();
  const { data: knowledge = [] } = useAIKnowledge();
  const { data: pages = [] } = useMessagingPages();
  const updateSettings = useUpdateAISettings();
  const saveKnowledge = useSaveKnowledge();
  const createPage = useCreateMessagingPage();

  const [prompt, setPrompt] = React.useState("");
  const [model, setModel] = React.useState("openai/gpt-4o-mini");
  const [temperature, setTemperature] = React.useState("0.7");
  const [maxTokens, setMaxTokens] = React.useState("500");
  const [newPage, setNewPage] = React.useState({
    name: "",
    page_id: "",
    access_token: "",
  });

  React.useEffect(() => {
    if (!settings) return;
    setPrompt(settings.system_prompt || "");
    setModel(settings.model || "openai/gpt-4o-mini");
    setTemperature(String(settings.temperature ?? 0.7));
    setMaxTokens(String(settings.max_tokens ?? 500));
  }, [settings]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AI System Prompt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2">
            <Label>System prompt</Label>
            <Textarea
              rows={8}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="grid gap-2">
              <Label>Model</Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Temperature</Label>
              <Input
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Max tokens</Label>
              <Input
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
              />
            </div>
          </div>
          <Button
            onClick={() =>
              updateSettings.mutate(
                {
                  system_prompt: prompt,
                  model,
                  temperature: Number(temperature),
                  max_tokens: Number(maxTokens),
                },
                {
                  onSuccess: () => toast.success("AI settings updated"),
                  onError: (error) => toast.error(error.message),
                },
              )
            }
          >
            <Save className="mr-2 h-4 w-4" />
            Save settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Knowledge Base</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {knowledge.map((item) => (
            <KnowledgeItem key={item.id} item={item} />
          ))}
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
            Add knowledge
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Messenger Pages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pages.map((page) => (
            <div key={page.id} className="rounded border p-3 text-sm">
              <div className="font-medium">{page.name}</div>
              <div className="text-muted-foreground">{page.page_id}</div>
            </div>
          ))}
          <div className="grid gap-2 md:grid-cols-3">
            <Input
              placeholder="Page name"
              value={newPage.name}
              onChange={(e) =>
                setNewPage((prev) => ({ ...prev, name: e.target.value }))
              }
            />
            <Input
              placeholder="Page ID"
              value={newPage.page_id}
              onChange={(e) =>
                setNewPage((prev) => ({ ...prev, page_id: e.target.value }))
              }
            />
            <Input
              placeholder="Page Access Token"
              value={newPage.access_token}
              onChange={(e) =>
                setNewPage((prev) => ({ ...prev, access_token: e.target.value }))
              }
            />
          </div>
          <Button
            variant="outline"
            onClick={() =>
              createPage.mutate(newPage, {
                onSuccess: () => {
                  toast.success("Messenger page added");
                  setNewPage({ name: "", page_id: "", access_token: "" });
                },
                onError: (error) => toast.error(error.message),
              })
            }
          >
            Add page
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
  };
}) {
  const saveKnowledge = useSaveKnowledge();
  const deleteKnowledge = useDeleteKnowledge();
  const [title, setTitle] = React.useState(item.title);
  const [content, setContent] = React.useState(item.content);
  const [isActive, setIsActive] = React.useState(item.is_active);
  const [sortOrder, setSortOrder] = React.useState(String(item.sort_order));

  return (
    <div className="space-y-2 rounded border p-3">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label>Active</Label>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>
        <Input
          className="w-28"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
        <Button
          variant="outline"
          onClick={() =>
            saveKnowledge.mutate(
              {
                id: item.id,
                payload: {
                  title,
                  content,
                  is_active: isActive,
                  sort_order: Number(sortOrder),
                },
              },
              {
                onSuccess: () => toast.success("Knowledge updated"),
                onError: (error) => toast.error(error.message),
              },
            )
          }
        >
          Save
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            deleteKnowledge.mutate(item.id, {
              onSuccess: () => toast.success("Knowledge removed"),
              onError: (error) => toast.error(error.message),
            })
          }
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </div>
    </div>
  );
}
