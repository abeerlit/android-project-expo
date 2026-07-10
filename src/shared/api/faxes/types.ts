export interface Fax {
  id: number;
  tenantId: number;
  date: string;
  direction: "IN" | "OUT";
  destNum: string;
  error: string;
  pages: number;
  remoteId: string;
  sourceName: string;
  sourceNum: string;
  status: "SUCCESS" | "FAILED" | "RETRYING" | "SENDING";
  statusEmail: string;
  type: "fax";
}

export interface FaxDownloadResponse {
  name: string;
  raw: string;
}

export interface FaxParams {
  uri: string;
  destinationNum: string;
}

export interface FaxResult {
  status: string;
  message: string;
}
