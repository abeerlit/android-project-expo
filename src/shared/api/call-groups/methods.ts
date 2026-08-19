import { CallGroup } from "shared/api/call-groups/types.ts";
import HttpClient from "shared/api/client/http-client.ts";
import { APIError } from "shared/api/client/types/types.ts";
import { Logger } from "shared/utils/Logger.ts";

const headers = {
  Accept: "application/json",
  Authorization: "",
  "Content-Type": "application/json"
};

const logger = new Logger("Call Groups API");

export const getCallGroups = async (accessToken: string, tenantId: number) => {
  const apiClient = new HttpClient();
  try {
    headers.Authorization = `Bearer ${accessToken}`;

    await apiClient.get(`/v2/call-groups?tenantId=${tenantId}`, headers);

    if (apiClient.success) {
      const { records } = apiClient.response;
      return records as CallGroup[];
    }
  } catch (error) {
    logger.error("getCallGroups() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};
