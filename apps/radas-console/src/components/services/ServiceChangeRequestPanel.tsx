import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, unwrapData } from "@/lib/api";
type Change={id:string;status:string;diff?:Record<string,unknown>;risk?:{level?:string};policy_results?:{passed?:boolean}};
export function ServiceChangeRequestPanel({projectId,serviceId}:{projectId:string;serviceId:string}){const [changes,setChanges]=useState<Change[]>([]);const load=async()=>{try{const r=await api<{data?:{changes?:Change[]}}>("GET",`/api/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(serviceId)}/changes`);setChanges(unwrapData<{changes?:Change[]}>(r)?.changes||[])}catch(e){toast.error(e instanceof Error?e.message:"Changes unavailable")}};useEffect(()=>{void load()},[projectId,serviceId]);return <Card data-testid="service-change-requests"><CardHeader><CardTitle className="text-sm">Change requests</CardTitle></CardHeader><CardContent className="space-y-2 text-xs">{changes.length?changes.map(c=><div key={c.id} className="flex items-center justify-between"><span>{c.id.slice(0,8)} · risk {c.risk?.level||"low"}</span><Badge>{c.status}</Badge></div>):<p className="text-[var(--color-muted-foreground)]">No reviewable changes.</p>}<Button size="sm" variant="outline" onClick={()=>void load()}>Refresh</Button></CardContent></Card>}
