export type ConferenceParticipant = {
  id: string;
  name: string;
  callId: string;
  cidName: string;
  cidNum: string;
  muted?: boolean;
};

export type ToggleParticipantMuteBody = {
  callId: string;
  channel: string;
  mute: boolean;
};

export type BootParticipantBody = {
  callId: string;
  channel: string;
};
