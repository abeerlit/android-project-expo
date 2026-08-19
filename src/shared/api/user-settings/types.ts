export interface VoicemailSettings {
  id: number;
  email: string;
  attach: string | null;
  greetings: {
    id: number;
    type: string;
    mailboxUser: string;
    mailboxContext: string;
    mediaUrl: string;
  }[];
}

export type ForwardingResponse = {
  forwarding: boolean;
  number?: string;
};
