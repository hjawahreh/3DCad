/**
 * Reserved project contracts (COD-012: contracts only).
 */

export interface CloudSynchronizationContract {
  readonly readonly: true;
  readonly remoteId: string;
}

export interface CollaborativeEditingContract {
  readonly readonly: true;
  readonly sessionId: string;
  readonly participants: readonly string[];
}

export interface ProjectVersionServerContract {
  readonly readonly: true;
  readonly serverUrl: string;
  readonly branch: string;
}

export interface MultiUserSessionContract {
  readonly readonly: true;
  readonly userId: string;
  readonly role: string;
}

export const RESERVED_PROJECT_CHANNELS = Object.freeze([
  'cloud-sync',
  'collaborative-editing',
  'project-version-server',
  'multi-user-sessions'
] as const);
