// src/interfaces/AppInfo.ts

export interface CommitLog {
  commit_hash: string;
  author: string;
  date: string;
  message: string;
}

export interface VersionHistory {
  version: string;
  release_date: string;
  environment: string;
  access_link: string;
  deprecated?: boolean;
  commit_log: CommitLog[];
}

export interface AppLinks {
  staging: string;
  canary: string;
  prod: string;
}

export interface AppVersions {
  staging: string;
  canary: string;
  prod: string;
}

export interface App {
  app_name: string;
  platform: string;
  versions: AppVersions;
  links: AppLinks;
  deprecated_version: string;
  version_history: VersionHistory[];
}

export interface Project {
  project_name: string;
  apps: App[];
}

export interface AppInformation {
  projects: Project[];
}

// This is the interface for the flattened data that ModelsTable will consume
export interface DisplayModel {
  project: string;
  application: string;
  platform: string; // "cli", "web", "app-android", etc.
  staging: string; // version string
  canary: string;  // version string
  production: string; // version string
  status: string; // Derived: "Active", "Deprecated (vX.X.X)", "Staging Only", etc.
  links: AppLinks;
  version_history: VersionHistory[];
}
