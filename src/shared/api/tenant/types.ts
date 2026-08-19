export interface Integration {
  id: number;
  name: string;
  category: string;
}

export type TenantSettingsResponse = {
  id: number;
  integrations: {
    category: string;
    id: number;
    name: string;
  }[];
  mfaEnabled: number;
  name: string;
  partnerId: number;
  partnerName: string;
  queuePauseReasons: string[];
  recordUserSessions: number;
};
