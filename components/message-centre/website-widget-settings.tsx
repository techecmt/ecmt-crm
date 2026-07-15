"use client";

import * as React from "react";
import { Check, ClipboardCopy, Globe2, Loader2, Save } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type WidgetConfig = {
  public_key: string;
  allowed_origins: string[];
  is_active: boolean;
};

export function WebsiteWidgetSettings() {
  const [config, setConfig] = React.useState<WidgetConfig | null>(null);
  const [origins, setOrigins] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/widget/config")
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) return null;
        const payload = (await response.json()) as WidgetConfig & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load widget settings");
        return payload;
      })
      .then((data) => {
        if (data) {
          setConfig(data);
          setOrigins(data.allowed_origins.join("\n"));
        }
      })
      .catch((error) => toast.error(error.message))
      .finally(() => setIsLoading(false));
  }, []);

  const save = async (isActive = config?.is_active) => {
    if (!config) return;
    setIsSaving(true);
    try {
      const allowedOrigins = origins
        .split(/\r?\n/)
        .map((origin) => origin.trim())
        .filter(Boolean);
      const response = await fetch("/api/widget/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowed_origins: allowedOrigins, is_active: isActive }),
      });
      const payload = (await response.json()) as WidgetConfig & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to save widget settings");
      setConfig(payload);
      setOrigins(payload.allowed_origins.join("\n"));
      toast.success("Website widget settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save widget settings");
    } finally {
      setIsSaving(false);
    }
  };

  const copySnippet = async () => {
    if (!config) return;
    const snippet = `<script src="${window.location.origin}/widget.js" data-widget-key="${config.public_key}" async></script>`;
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    toast.success("Widget snippet copied");
    window.setTimeout(() => setCopied(false), 1_500);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading website widget…
        </CardContent>
      </Card>
    );
  }
  if (!config) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe2 className="h-4 w-4 text-blue-600" />
              Website chat widget
            </CardTitle>
            <CardDescription>
              Allow the college website, then copy the script into its HTML.
            </CardDescription>
          </div>
          <Badge variant={config.is_active ? "default" : "secondary"}>
            {config.is_active ? "Active" : "Paused"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">Accept new website chats</p>
            <p className="text-xs text-muted-foreground">
              Pausing prevents the loader from starting new conversations.
            </p>
          </div>
          <Switch
            checked={config.is_active}
            disabled={isSaving}
            onCheckedChange={(checked) => void save(checked)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="widget-origins">Allowed website origins</Label>
          <Textarea
            id="widget-origins"
            value={origins}
            onChange={(event) => setOrigins(event.target.value)}
            placeholder={"https://www.edusphere.edu.sg\nhttps://www.lumax.edu.sg"}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">One exact origin per line. Include the protocol.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void save()} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save origins
          </Button>
          <Button variant="outline" onClick={() => void copySnippet()}>
            {copied ? <Check className="mr-2 h-4 w-4" /> : <ClipboardCopy className="mr-2 h-4 w-4" />}
            Copy installation snippet
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
