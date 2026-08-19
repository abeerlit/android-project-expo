import HttpClient from "../client/http-client.ts";
import { APIError } from "shared/api/client/types/types.ts";
import { CallRecording } from "shared/api/call-recordings/types.ts";

const headers = {
  Accept: "application/json",
  Authorization: ""
};

export const getCallRecording = async (
  accessToken: string,
  uniqueId: string
) => {
  const apiClient = new HttpClient();
  try {
    headers.Authorization = `Bearer ${accessToken}`;

    await apiClient.get(`/v2/call-recordings/${uniqueId}`, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as CallRecording;
    }
  } catch (error) {
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};
