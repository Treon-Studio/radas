import React, { useState, useEffect } from "react";
import { Button } from "@radas/ui/ui/button";
import { Input } from "@radas/ui/ui/input";
import { Label } from "@radas/ui/ui/label";
import { Switch } from "@radas/ui/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@radas/ui/ui/select";
import { Textarea } from "@radas/ui/ui/textarea";
import { Badge } from "@radas/ui/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radas/ui/ui/tabs";
import {
  NotificationProvider,
  NotificationType,
  type NotificationProviderConfig,
  type CreateProviderConfigDto,
} from "../entity";

interface ProviderSettingsFormProps {
  existingConfig?: NotificationProviderConfig;
  onSave: (data: Omit<CreateProviderConfigDto, "userId" | "projectId">) => Promise<void>;
  onCancel: () => void;
}

const providerOptions: { value: NotificationProvider; label: string }[] = [
  { value: NotificationProvider.DISCORD, label: "Discord" },
  { value: NotificationProvider.WHATSAPP, label: "WhatsApp" },
  { value: NotificationProvider.SLACK, label: "Slack" },
  { value: NotificationProvider.TELEGRAM, label: "Telegram" },
];

const eventTypes: NotificationType[] = [
  NotificationType.INFO,
  NotificationType.SUCCESS,
  NotificationType.WARNING,
  NotificationType.ERROR,
  NotificationType.TASK_ASSIGNED,
  NotificationType.TASK_UPDATED,
  NotificationType.TASK_COMPLETED,
  NotificationType.PROJECT_INVITE,
  NotificationType.COMMENT_MENTION,
  NotificationType.DEADLINE_REMINDER,
  NotificationType.SYSTEM,
];

export function ProviderSettingsForm({
  existingConfig,
  onSave,
  onCancel,
}: ProviderSettingsFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState<NotificationProvider>(NotificationProvider.DISCORD);
  const [useGlobalUrl, setUseGlobalUrl] = useState(true);
  const [globalWebhookUrl, setGlobalWebhookUrl] = useState("");
  const [webhookUrlPerEvent, setWebhookUrlPerEvent] = useState<Record<NotificationType, string>>({} as any);
  const [enabledEvents, setEnabledEvents] = useState<NotificationType[]>(eventTypes);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (existingConfig) {
      setName(existingConfig.name);
      setDescription(existingConfig.description || "");
      setProvider(existingConfig.provider);
      setUseGlobalUrl(existingConfig.useGlobalUrl);
      setGlobalWebhookUrl(existingConfig.webhookUrl);
      setWebhookUrlPerEvent(existingConfig.webhookUrlPerEvent || ({} as any));
      setEnabledEvents(existingConfig.enabledEvents);
    }
  }, [existingConfig]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!name.trim()) {
      alert("Please enter a configuration name");
      return;
    }

    if (useGlobalUrl && !globalWebhookUrl.trim()) {
      alert("Please enter a webhook URL");
      return;
    }

    if (enabledEvents.length === 0) {
      alert("Please select at least one event type");
      return;
    }

    setLoading(true);

    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        provider,
        useGlobalUrl,
        webhookUrl: globalWebhookUrl.trim(),
        webhookUrlPerEvent: useGlobalUrl ? undefined : webhookUrlPerEvent,
        enabledEvents,
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleEvent = (event: NotificationType) => {
    if (enabledEvents.includes(event)) {
      setEnabledEvents(enabledEvents.filter((e) => e !== event));
    } else {
      setEnabledEvents([...enabledEvents, event]);
    }
  };

  const updateEventUrl = (event: NotificationType, url: string) => {
    setWebhookUrlPerEvent({
      ...webhookUrlPerEvent,
      [event]: url,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Basic Info Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-3">Basic Information</h3>
          <div className="space-y-4">
            {/* Provider */}
            <div className="space-y-2">
              <Label htmlFor="provider">
                Provider <span className="text-destructive">*</span>
              </Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as NotificationProvider)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providerOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Configuration Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Team Discord Server"
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description for this configuration"
                rows={2}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Webhook URL Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-3">Webhook URL Configuration</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Choose how to configure webhook URLs for different event types
          </p>

          {/* Use Global URL Toggle */}
          <div className="flex items-center justify-between p-4 border rounded-lg mb-4">
            <div className="space-y-0.5">
              <Label className="font-medium">Use Single URL for All Events</Label>
              <p className="text-sm text-muted-foreground">
                Use one webhook URL for all notification types
              </p>
            </div>
            <Switch checked={useGlobalUrl} onCheckedChange={setUseGlobalUrl} />
          </div>

          <Tabs value={useGlobalUrl ? "global" : "per-event"} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="global" onClick={() => setUseGlobalUrl(true)}>
                Global URL
              </TabsTrigger>
              <TabsTrigger value="per-event" onClick={() => setUseGlobalUrl(false)}>
                Per Event URLs
              </TabsTrigger>
            </TabsList>

            <TabsContent value="global" className="space-y-3 mt-4">
              <div className="space-y-2">
                <Label htmlFor="globalUrl">
                  Webhook URL <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="globalUrl"
                  type="url"
                  value={globalWebhookUrl}
                  onChange={(e) => setGlobalWebhookUrl(e.target.value)}
                  placeholder={
                    provider === "discord"
                      ? "https://discord.com/api/webhooks/..."
                      : "https://..."
                  }
                  required={useGlobalUrl}
                />
                <p className="text-xs text-muted-foreground">
                  {provider === "discord" && "Discord webhook URL from Server Settings > Integrations"}
                  {provider === "whatsapp" && "WhatsApp webhook URL (Twilio, etc.)"}
                  {provider === "slack" && "Slack webhook URL from Apps > Incoming Webhooks"}
                  {provider === "telegram" && "Telegram bot webhook URL"}
                </p>
              </div>
            </TabsContent>

            <TabsContent value="per-event" className="space-y-3 mt-4">
              <p className="text-sm text-muted-foreground mb-3">
                Configure different webhook URLs for each event type
              </p>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                {eventTypes.map((event) => (
                  <div key={event} className="space-y-2">
                    <Label htmlFor={`url-${event}`} className="text-sm capitalize">
                      {event.replace(/_/g, " ")}
                    </Label>
                    <Input
                      id={`url-${event}`}
                      type="url"
                      value={webhookUrlPerEvent[event] || ""}
                      onChange={(e) => updateEventUrl(event, e.target.value)}
                      placeholder="https://..."
                      disabled={!enabledEvents.includes(event)}
                    />
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Event Filters Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-3">Event Filters</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Select which notification types to send to this provider
          </p>
          <div className="flex flex-wrap gap-2">
            {eventTypes.map((event) => (
              <Badge
                key={event}
                variant={enabledEvents.includes(event) ? "default" : "outline"}
                className="cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => toggleEvent(event)}
              >
                {event.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Click on badges to toggle event types. Selected events will be sent to this webhook.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={loading || !name.trim() || (useGlobalUrl && !globalWebhookUrl.trim())}
        >
          {loading ? "Saving..." : existingConfig ? "Update Provider" : "Create Provider"}
        </Button>
      </div>
    </form>
  );
}
