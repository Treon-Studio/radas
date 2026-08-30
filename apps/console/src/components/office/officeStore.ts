// Minimal office store shim — replaces munder-difflin's full zustand store.
// Only the fields OfficeFloor.tsx reads are exposed; the rest are stubbed.

import { create } from "zustand";

export type ToolKind =
  | "Read" | "Edit" | "Write" | "Bash" | "WebFetch" | "WebSearch"
  | "Grep" | "Glob" | "TodoWrite" | "MCP";

export type StationKind =
  | "shelf" | "terminal" | "web" | "board" | "mailbox" | "mcp" | "desk";

export interface Agent {
  id: string;
  name: string;
  character: string;
  accent: string;
  description: string;
  project: string;
  tmuxTarget?: string;
  cwd?: string;
  goal?: string;
  note?: string;
  status: string;
  action: string;
  progress: number;
  currentStation?: string;
  carrying?: string;
  recentAssistantText?: string;
  recentTextTs?: number;
  blockReason?: string;
  ptyId?: string;
  mountEpoch?: number;
  // extra fields munder-difflin's Agent interface includes
  [key: string]: unknown;
}

interface OfficeStore {
  agents: Agent[];
  selectedId: string | null;
  fullscreenAgentId: string | null;
  ideOpen: boolean;
  officeTheme: string;
  /** per-agent terminal feed lines (mockEvents pushes, DeskScreen shows) */
  feed: Record<string, string[]>;
  setOfficeTheme: (t: string) => void;
  setFullscreenAgentId: (id: string | null) => void;
  toggleIde: () => void;
  // munder-difflin's full store fields referenced by OfficeFloor + mockEvents
  select: (id: string | null) => void;
  requestCommandCenterTab: (agentId: string, tab: string) => void;
  updateAgent: (id: string, patch: Partial<Agent>) => void;
  pushFeed: (id: string, line: string) => void;
}

// Mock cast so the office renders without a real agent harness.
const MOCK_AGENTS: Agent[] = [
  // prettier-ignore
  {
    id: "michael",
    name: "Michael Scott",
    character: "michael",
    accent: "coral",
    description: "World's Best Boss",
    project: "radas",
    status: "idle",
    action: "awaiting",
    progress: 0,
    isGod: true,
  },
  {
    id: "dwight",
    name: "Dwight Schrute",
    character: "dwight",
    accent: "mint",
    description: "Assistant TO the Regional Manager",
    project: "radas",
    status: "thinking",
    action: "heading to shelf",
    currentStation: "shelf",
    progress: 2,
  },
  {
    id: "jim",
    name: "Jim Halpert",
    character: "jim",
    accent: "sky",
    description: "Sales",
    project: "radas",
    status: "working",
    action: "running tests",
    carrying: "Bash",
    currentStation: "terminal",
    progress: 5,
  },
  {
    id: "pam",
    name: "Pam Beesly",
    character: "pam",
    accent: "lemon",
    description: "Receptionist, artist",
    project: "radas",
    status: "working",
    action: "reading SPEC.md",
    carrying: "Read",
    currentStation: "shelf",
    progress: 3,
  },
];

export const useStore = create<OfficeStore>((set) => ({
  agents: MOCK_AGENTS,
  feed: {},
  selectedId: null,
  fullscreenAgentId: null,
  ideOpen: false,
  officeTheme: "office",
  setOfficeTheme: (t) => set({ officeTheme: t }),
  setFullscreenAgentId: (id) => set({ fullscreenAgentId: id }),
  toggleIde: () => set((s) => ({ ideOpen: !s.ideOpen })),
  select: (id) => set({ selectedId: id }),
  requestCommandCenterTab: () => {},
  updateAgent: (id, patch) =>
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })),
  pushFeed: (id, line) =>
    set((s) => ({ feed: { ...s.feed, [id]: [...(s.feed[id] ?? []), line] } })),
}));
