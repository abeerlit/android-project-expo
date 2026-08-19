export interface CallGroup {
  id: number;
  name: string;
  number: string;
  ringStrategy: string;
  branchId: number | null;
  branchName: string | null;
}
