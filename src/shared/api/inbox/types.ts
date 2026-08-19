import { Fax } from "shared/api/faxes/types.ts";

export interface Voicemail {
  id: number;
  dir: string;
  date: number;
  callerId: string;
  duration: number;
  mailboxuser: string;
  mailboxcontext: string;
  msg_id: string;
  msgnum: number;
  type: string;
  status: string;
  callerName: string;
  callerNumber: string;
}

export interface UserCallData {
  records: CallData[];
  page: number;
  recordsPerPage: number;
  total: number;
}

export interface CallData {
  id: number;
  uniqueId: string;
  startTime: string;
  endTime: string;
  callerIdNum: string;
  callerIdName: string;
  dialedNum: string;
  dialedName: string;
  direction: "inbound" | "outbound";
  disposition: string;
  duration: number;
  recorded: number;
  callId: string;
  tenantId: string;
  queueId: number;
  voicemail: 1 | 0;
}

export type AllActivity = Array<Voicemail | Fax | UserCallData>;
