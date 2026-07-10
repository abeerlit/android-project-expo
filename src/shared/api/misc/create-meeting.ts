import HttpClient from "../client/http-client.ts";
import { APIError } from "shared/api/client/types/types.ts";
import { CreateMeetingRequest, CreateMeetingResponse } from "./types.ts";
import { Logger } from "shared/utils/Logger.ts";

const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
  Authorization: ""
};

const logger = new Logger("CreateMeeting");

export const createMeeting = async (
  params: CreateMeetingRequest,
  accessToken: string
): Promise<CreateMeetingResponse> => {
  const apiClient = new HttpClient();
  try {
    headers.Authorization = `Bearer ${accessToken}`;

    await apiClient.post("/v2/meet/create", params, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as CreateMeetingResponse;
    }
  } catch (error) {
    logger.error("createMeeting() error:", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};
