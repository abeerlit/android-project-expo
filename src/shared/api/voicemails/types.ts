export interface VMGreeting {
  id: number;
  mediaUrl: string;
}

export interface VoicemailMessage {
  id: number;
  callerId: string;
  origTime: number;
  duration: number;
  mailboxUser: string;
  mailboxContext: string;
  status: "read" | "unread";
  transcript: string | null;
  mediaURL?: string;
}
