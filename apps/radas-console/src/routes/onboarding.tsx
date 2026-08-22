import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  RiCheckLine as Check,
  RiArrowRightLine as ArrowRight,
  RiArrowLeftLine as ArrowLeft,
  RiRocketLine as Rocket,
  RiFolderAddLine as FolderAdd,
  RiCloudLine as Cloud,
  RiPlayLine as Play,
  RiCheckboxCircleLine as CheckCircle,
} from "@remixicon/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useProjects } from "@/lib/project";
import { api } from "@/lib/api";

export const Route = createFileRoute("/onboarding")({ component: OnboardingPage });

function OnboardingPage() {
  const navigate = useNavigate();
  const { projects, loading, createProject } = useProjects();
  const [step, setStep] = useState(0);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  // Check onboarding status
  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: () => api<{ completed: boolean }>("GET", "/api/onboarding/status"),
  });

  const completeOnboarding = useMutation({
    mutationFn: () => api("POST", "/api/onboarding/complete"),
    onSuccess: () => {
      toast.success("Onboarding complete! Welcome to Radas.");
      navigate({ to: "/dashboard" });
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async () => {
      return createProject({ name: projectName, description: projectDescription });
    },
    onSuccess: (project) => {
      toast.success(`Project "${projectName}" created`);
      setStep(2);
    },
    onError: (err) => {
      toast.error("Failed to create project: " + (err as Error).message);
    },
  });

  // If already completed, redirect to dashboard
  useEffect(() => {
    if (status?.completed) {
      navigate({ to: "/dashboard" });
    }
  }, [status, navigate]);

  const steps = [
    { title: "Welcome", icon: Rocket },
    { title: "Create Project", icon: FolderAdd },
    { title: "Choose Provider", icon: Cloud },
    { title: "Deploy First Stack", icon: Play },
    { title: "Done", icon: CheckCircle },
  ];

  const totalSteps = steps.length;

  const next = () => {
    if (step === 0) {
      // Welcome: just proceed
      setStep(1);
    } else if (step === 1) {
      if (!projectName.trim()) {
        toast.error("Please enter a project name");
        return;
      }
      createProjectMutation.mutate();
    } else if (step === 2) {
      if (!selectedProvider) {
        toast.error("Please select a provider");
        return;
      }
      // Navigate to stack creation for the selected provider
      if (selectedProvider === "bytedc") navigate({ to: "/cloud/stacks/new/bytedc" });
      else if (selectedProvider === "hetzner") navigate({ to: "/cloud/stacks/new/hetzner" });
      else if (selectedProvider === "biznet") navigate({ to: "/cloud/stacks/new/biznet" });
      else if (selectedProvider === "idcloudhost") navigate({ to: "/cloud/stacks/new/idcloudhost" });
      else if (selectedProvider === "cloudflare") navigate({ to: "/cloud/stacks/new/cloudflare" });
      else if (selectedProvider === "aws") navigate({ to: "/cloud/stacks/new/aws" });
      else if (selectedProvider === "eks") navigate({ to: "/cloud/stacks/new/eks" });
      else if (selectedProvider === "gcp") navigate({ to: "/cloud/stacks/new/gcp" });
      else if (selectedProvider === "gke") navigate({ to: "/cloud/stacks/new/gke" });
      else if (selectedProvider === "kubernetes" || selectedProvider === "k8s") navigate({ to: "/cloud/stacks/new/kubernetes" });
      else navigate({ to: "/cloud/stacks/new" });
      // Mark onboarding as completed after navigating
      completeOnboarding.mutate();
    } else if (step === 3) {
      // Deploy step: user will deploy via the stack wizard
      // After they create a stack, they'll be redirected and we mark complete
      // For now, we just mark complete and go to dashboard
      completeOnboarding.mutate();
    } else {
      completeOnboarding.mutate();
    }
  };

  const back = () => {
    if (step > 0) setStep(step - 1);
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4 text-center">
            <div className="mx-auto w-20 h-20 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center">
              <Rocket className="h-10 w-10 text-[var(--color-primary)]" />
            </div>
            <h2 className="text-2xl font-bold">Welcome to Radas</h2>
            <p className="text-[var(--color-muted-foreground)] max-w-md mx-auto">
              Radas is your GitOps control plane for OpenTofu and Ansible. Let's get you started
              with your first project and stack.
            </p>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              You'll create a project, pick a cloud provider, and deploy your first infrastructure.
            </p>
          </div>
        );
      case 1:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Create your first project</h2>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Projects isolate your infrastructure and configurations.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Project Name *</label>
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. my-infra"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Input
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  placeholder="Optional description"
                  className="mt-1"
                />
              </div>
            </div>
            {createProjectMutation.isPending && (
              <div className="text-sm text-[var(--color-muted-foreground)]">Creating project...</div>
            )}
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Choose a cloud provider</h2>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Select a provider to provision infrastructure. You can always add more later.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: "bytedc", label: "ByteDC" },
                { id: "hetzner", label: "Hetzner" },
                { id: "aws", label: "AWS" },
                { id: "gcp", label: "GCP" },
                { id: "cloudflare", label: "Cloudflare" },
                { id: "idcloudhost", label: "IDCloudHost" },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProvider(p.id)}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    selectedProvider === p.id
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
                      : "border-[var(--color-border)] hover:border-[var(--color-foreground)]/30"
                  }`}
                >
                  <div className="font-medium">{p.label}</div>
                  <div className="text-xs text-[var(--color-muted-foreground)] mt-1">
                    {p.id === "bytedc" && "OpenStack-based"}
                    {p.id === "hetzner" && "Hetzner Cloud API"}
                    {p.id === "aws" && "Amazon Web Services"}
                    {p.id === "gcp" && "Google Cloud Platform"}
                    {p.id === "cloudflare" && "Cloudflare API"}
                    {p.id === "idcloudhost" && "IDCloudHost API"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4 text-center">
            <div className="mx-auto w-20 h-20 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center">
              <Play className="h-10 w-10 text-[var(--color-success)]" />
            </div>
            <h2 className="text-2xl font-bold">Deploy your first stack</h2>
            <p className="text-[var(--color-muted-foreground)] max-w-md mx-auto">
              You'll be taken to the stack creation wizard for {selectedProvider || "your chosen provider"}.
              Fill in the details and deploy your first infrastructure.
            </p>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              You can always skip this step and come back later.
            </p>
          </div>
        );
      case 4:
        return (
          <div className="space-y-4 text-center">
            <div className="mx-auto w-20 h-20 rounded-full bg-[var(--color-success)]/20 flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-[var(--color-success)]" />
            </div>
            <h2 className="text-2xl font-bold">You're all set!</h2>
            <p className="text-[var(--color-muted-foreground)] max-w-md mx-auto">
              Your onboarding is complete. You can now manage your infrastructure, run playbooks,
              and explore all Radas features.
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  const canNext = () => {
    if (step === 0) return true;
    if (step === 1) return !!projectName.trim() && !createProjectMutation.isPending;
    if (step === 2) return !!selectedProvider;
    if (step === 3) return true;
    return true;
  };

  const nextLabel = () => {
    if (step === 0) return "Get Started";
    if (step === 1) return "Create Project";
    if (step === 2) return "Choose Provider";
    if (step === 3) return "Deploy Stack";
    return "Finish";
  };

  if (status === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (status?.completed) {
    return null; // will redirect via useEffect
  }

  return (
    <div className="flex items-center justify-center min-h-[80vh] p-4">
      <Card className="w-full max-w-2xl">
        <CardContent className="p-6 md:p-8">
          <div className="mb-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                {steps.map((s, i) => (
                  <div
                    key={i}
                    className={`w-3 h-3 rounded-full ${
                      i <= step ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-[var(--color-muted-foreground)]">
                Step {step + 1} of {totalSteps}
              </span>
            </div>
            <div className="mt-4 h-1 w-full bg-[var(--color-border)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-primary)] transition-all duration-300"
                style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
              />
            </div>
          </div>

          <div className="min-h-[300px]">{renderStep()}</div>

          <div className="flex justify-between mt-8 pt-4 border-t border-[var(--color-border)]">
            <Button variant="outline" onClick={back} disabled={step === 0}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button
              onClick={next}
              disabled={!canNext()}
            >
              {nextLabel()}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}