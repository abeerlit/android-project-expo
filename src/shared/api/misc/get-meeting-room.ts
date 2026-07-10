import HttpClient from "../client/http-client.ts";
import { APIError } from "shared/api/client/types/types.ts";
import { CreateMeetingResponse } from "./types.ts";
import { Logger } from "shared/utils/Logger.ts";
import { normalizeMeetRoomKey } from "features/meeting/meetJoinUtils.ts";

const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
  Authorization: ""
};

const logger = new Logger("GetMeetingRoom");

/** GET /v2/meet/room/:roomId — same payload shape as create meeting (room + Daily token). */
export const getMeetingRoom = async (
  roomId: string,
  accessToken: string
): Promise<CreateMeetingResponse> => {
  const apiClient = new HttpClient();
  const encoded = encodeURIComponent(normalizeMeetRoomKey(roomId));
  try {
    headers.Authorization = `Bearer ${accessToken}`;
    await apiClient.get(`/v2/meet/room/${encoded}`, headers);
    if (apiClient.success) {
      return apiClient.response as unknown as CreateMeetingResponse;
    }
  } catch (error) {
    logger.error("getMeetingRoom() error:", error);
    throw error as unknown as APIError;
  }
  throw apiClient.response as unknown as APIError;
};

