import { useState } from "react";
import { RiSparkling2Line as Sparkles, RiFileTextLine as FileText, RiCodeLine as Code } from "@remixicon/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

type Finding = { severity: string; risk: string; suggestion: string };

export function AiTools({ stackId }: { stackId: string }) {
  const [review, setReview] = useState<string>("");
  const [reviewOut, setReviewOut] = useState<Finding[] | null>(null);
  const [docsOut, setDocsOut] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [draftOut, setDraftOut] = useState<string | null>(null);

  const runReview = async () => {
    if (!review.trim()) return toast.error("Paste a plan snippet first");
    const res = await api<{ findings: Finding[] }>("POST", "/api/ai/review-plan", { plan_text: review });
    setReviewOut(res.findings);
  };
  const runDocs = async () => {
    const res = await api<{ markdown: string }>("POST", "/api/ai/stack-docs", { stack: stackId });
    setDocsOut(res.markdown);
  };
  const runDraft = async () => {
    if (!prompt.trim()) return toast.error("Describe the playbook");
    const res = await api<{ playbook: string }>("POST", "/api/ai/playbook-draft", { prompt });
    setDraftOut(res.playbook);
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4" /> AI Tools</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="space-y-1">
          <div className="text-xs text-[var(--color-muted-foreground)]">Plan review (cost/security)</div>
          <textarea className="h-20 w-full rounded-md border border-[var(--color-input)] bg-transparent px-3 py-2 font-mono text-xs"
            value={review} onChange={(e) => setReview(e.target.value)}
            placeholder={'resource ... { ingress { cidr_blocks = ["0.0.0.0/0"] } }'} />
          <Button size="sm" variant="outline" onClick={runReview}><Sparkles className="h-3.5 w-3.5" /> Review</Button>
          {reviewOut && (
            <div className="space-y-1 text-sm">
              {reviewOut.map((f, i) => (
                <div key={i} className="flex gap-2">
                  <span className={f.severity === "high" ? "text-[var(--color-destructive)]" : "text-[var(--color-warning)]"}>{f.severity}</span>
                  <span>{f.risk}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={runDocs}><FileText className="h-3.5 w-3.5" /> Generate README</Button>
        </div>
        {docsOut && <pre className="rounded-md border border-[var(--color-border)] p-3 text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">{docsOut}</pre>}

        <div className="space-y-1">
          <div className="text-xs text-[var(--color-muted-foreground)]">Playbook draft</div>
          <input className="h-9 w-full rounded-md border border-[var(--color-input)] bg-transparent px-3 text-sm"
            value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="install nginx on web hosts" />
          <Button size="sm" variant="outline" onClick={runDraft}><Code className="h-3.5 w-3.5" /> Draft</Button>
          {draftOut && <pre className="rounded-md border border-[var(--color-border)] p-3 text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">{draftOut}</pre>}
        </div>
      </CardContent>
    </Card>
  );
}
