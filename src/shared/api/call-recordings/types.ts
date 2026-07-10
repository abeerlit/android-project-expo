export type CallRecording = {
  mediaURL: string | null;
  time: string;
  tenantId: number;
  direction: "OUT" | "IN" | "INTERNAL";
  callerIdNum: string;
  callerIdName: string;
  duration: number;
  uniqueId: string;
  dialedNum: string;
  whoAnswered: string;
};
