// Minimal office store shim — replaces munder-difflin's full zustand store.
// Only the fields OfficeFloor.tsx reads are exposed; the rest are stubbed.

import { create } from "zustand";

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
  setOfficeTheme: (t: string) => void;
  setFullscreenAgentId: (id: string | null) => void;
  toggleIde: () => void;
  // munder-difflin's full store fields referenced by OfficeFloor — stubbed.
  select: (id: string | null) => void;
  requestCommandCenterTab: (agentId: string, tab: string) => void;
}

// Mock cast so the office renders without a real agent harness.
const MOCK_AGENTS: Agent[] = [
  {
    id: "michael",
    name: "Michael Scott",
    character: "michael",
    accent: "coral",
    description: "World's Best Boss",
    project: "radas",
    status: "idle",
    action: "Managing",
    progress: 0,
  },
  {
    id: "dwight",
    name: "Dwight Schrute",
    character: "dwight",
    accent: "mint",
    description: "Assistant TO the Regional Manager",
    project: "radas",
    status: "working",
    action: "crunching data",
    progress: 42,
  },
  {
    id: "jim",
    name: "Jim Halpert",
    character: "jim",
    accent: "sky",
    description: "Sales",
    project: "radas",
    status: "thinking",
    action: "thinking",
    progress: 10,
  },
];

export const useStore = create<OfficeStore>((set) => ({
  agents: MOCK_AGENTS,
  selectedId: null,
  fullscreenAgentId: null,
  ideOpen: false,
  officeTheme: "office",
  setOfficeTheme: (t) => set({ officeTheme: t }),
  setFullscreenAgentId: (id) => set({ fullscreenAgentId: id }),
  toggleIde: () => set((s) => ({ ideOpen: !s.ideOpen })),
  select: (id) => set({ selectedId: id }),
  requestCommandCenterTab: () => {},
}));
