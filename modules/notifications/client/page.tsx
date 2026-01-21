"use client";

import React, { useState } from "react";
import { Bell, Settings, Plus, Trash2, Edit } from "lucide-react";
import { Button } from "@radas/ui/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@radas/ui/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radas/ui/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@radas/ui/ui/dialog";
import { Badge } from "@radas/ui/ui/badge";
import { NotificationList } from "./components/notification-list";
import { ProviderSettingsForm } from "./components/provider-settings-form";
import { useProviderConfigs, useProviderMutations } from "./hooks/use-provider-hooks";
import { toast } from "sonner";
import type { NotificationProviderConfig, CreateProviderConfigDto } from "./entity";

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState<"notifications" | "providers">("notifications");
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<NotificationProviderConfig | undefined>();

  const { configs, loading: configsLoading } = useProviderConfigs();
  const providerMutations = useProviderMutations();

  const handleCreateProvider = () => {
    setEditingProvider(undefined);
    setShowProviderForm(true);
  };

  const handleEditProvider = (config: NotificationProviderConfig) => {
    setEditingProvider(config);
    setShowProviderForm(true);
  };

  const handleSaveProvider = async (data: Omit<CreateProviderConfigDto, "userId" | "projectId">) => {
    if (editingProvider) {
      // Update existing
      const result = await providerMutations.update(editingProvider.id, data);
      if (result.success) {
        toast.success("Provider updated successfully");
        setShowProviderForm(false);
      } else {
        toast.error(result.error || "Failed to update provider");
      }
    } else {
      // Create new - add projectId (using "default" for global page)
      // TODO: This global page should ideally be removed in favor of project-specific notifications
      const result = await providerMutations.create({
        ...data,
        projectId: "default",
      });
      if (result.success) {
        toast.success("Provider created successfully");
        setShowProviderForm(false);
      } else {
        toast.error(result.error || "Failed to create provider");
      }
    }
  };

  const handleDeleteProvider = async (id: string, name: string) => {
    if (confirm(`Delete provider "${name}"?`)) {
      const result = await providerMutations.remove(id);
      if (result.success) {
        toast.success("Provider deleted");
      } else {
        toast.error(result.error || "Failed to delete provider");
      }
    }
  };

  const handleToggleProvider = async (id: string, enabled: boolean) => {
    const result = await providerMutations.update(id, { enabled });
    if (result.success) {
      toast.success(enabled ? "Provider enabled" : "Provider disabled");
    } else {
      toast.error(result.error || "Failed to update provider");
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell size={28} />
          Notifications
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your notifications and webhook integrations
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 p-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="h-full flex flex-col">
          <TabsList className="w-fit">
            <TabsTrigger value="notifications">
              <Bell size={16} className="mr-2" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="providers">
              <Settings size={16} className="mr-2" />
              Providers
            </TabsTrigger>
          </TabsList>

          <TabsContent value="notifications" className="flex-1 mt-4">
            <Card className="h-full">
              <NotificationList />
            </Card>
          </TabsContent>

          <TabsContent value="providers" className="flex-1 mt-4 overflow-auto">
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Webhook Providers</h2>
                  <p className="text-sm text-muted-foreground">
                    Configure external webhook integrations (Discord, WhatsApp, etc.)
                  </p>
                </div>
                <Button onClick={handleCreateProvider}>
                  <Plus size={16} className="mr-2" />
                  Add Provider
                </Button>
              </div>

              {/* Provider List */}
              {configsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : configs.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center h-64 text-center">
                    <Settings size={48} className="text-muted-foreground mb-4" />
                    <h3 className="font-semibold mb-2">No providers configured</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Add a webhook provider to send notifications to external services
                    </p>
                    <Button onClick={handleCreateProvider}>
                      <Plus size={16} className="mr-2" />
                      Add Provider
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {configs.map((config) => (
                    <Card key={config.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="flex items-center gap-2">
                              {config.name}
                              <Badge variant={config.enabled ? "default" : "secondary"}>
                                {config.enabled ? "Enabled" : "Disabled"}
                              </Badge>
                              <Badge variant="outline" className="capitalize">
                                {config.provider}
                              </Badge>
                            </CardTitle>
                            {config.description && (
                              <CardDescription className="mt-1">
                                {config.description}
                              </CardDescription>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEditProvider(config)}
                            >
                              <Edit size={16} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteProvider(config.id, config.name)}
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <p className="text-sm font-medium mb-1">Webhook URL</p>
                          <code className="text-xs bg-muted px-2 py-1 rounded block truncate">
                            {config.webhookUrl}
                          </code>
                        </div>

                        <div>
                          <p className="text-sm font-medium mb-2">
                            Enabled Events ({config.enabledEvents.length})
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {config.enabledEvents.slice(0, 5).map((event) => (
                              <Badge key={event} variant="outline" className="text-xs">
                                {event.replace(/_/g, " ")}
                              </Badge>
                            ))}
                            {config.enabledEvents.length > 5 && (
                              <Badge variant="outline" className="text-xs">
                                +{config.enabledEvents.length - 5} more
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="pt-2 border-t">
                          <Button
                            size="sm"
                            variant={config.enabled ? "outline" : "default"}
                            onClick={() => handleToggleProvider(config.id, !config.enabled)}
                          >
                            {config.enabled ? "Disable" : "Enable"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Provider Form Dialog */}
      <Dialog open={showProviderForm} onOpenChange={setShowProviderForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProvider ? "Edit Provider" : "Add New Provider"}
            </DialogTitle>
            <DialogDescription>
              Configure webhook integration for external notification delivery
            </DialogDescription>
          </DialogHeader>
          <ProviderSettingsForm
            existingConfig={editingProvider}
            onSave={handleSaveProvider}
            onCancel={() => setShowProviderForm(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
