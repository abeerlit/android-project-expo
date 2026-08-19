export type CreateMeetingRequest = {
  type: "onDemand";
  userId: string;
  tenantId: string;
  ext: string;
};

export type CreateMeetingResponse = {
  admins: null | string[];
  createdAt: string;
  dialIn: string;
  dialInNum: string;
  enableTranscription: number;
  expires: number;
  id: number;
  meetURL: string;
  name: string;
  pin: string;
  roomId: string;
  tenantId: number;
  token: string;
  userId: number;
};
