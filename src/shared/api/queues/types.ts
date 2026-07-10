export interface CallQueue {
  id: number;
  name: string;
  number: string;
  ringStrategy: string;
  recording: string;
  branchId: number | null;
  branchName: string | null;
}

export type AgentQueue = {
  queueId: number;
  queueName: string;
  dnd: number;
  loggedIn: boolean;
  agentPickup: 0 | 1;
};

export type AgentQueues = {
  name: string;
  peerName: string;
  extDND: string;
  loggedIn: number;
  paused: number;
  pausedReason: string;
  queues: AgentQueue[];
  adminQueues: Partial<AgentQueue>[];
};

export type QueueLoginResponse = {
  message: string;
  loggedIn: 1 | 0;
  peerName: string;
};

export type QueuePauseResponse = {
  message: string;
  paused: 1 | 0;
  peerName: string;
  pauseReason: string;
};

export type QueueDNDResponse = {
  message: string;
  peerName: string;
  queueId: number;
  dnd: 1 | 0;
};
