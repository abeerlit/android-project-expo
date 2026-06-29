import { APIError } from "../client/types/types.ts";
import HttpClient from "../client/http-client.ts";
import {
  ConferenceParticipant,
  ToggleParticipantMuteBody,
  BootParticipantBody
} from "./types";

// Base Headers
const headers = {
  Accept: "application/json",
  Authorization: "TOKEN",
  "Content-Type": "application/json"
};

/**
 * List all participants in a conference call
 */
export const listConferenceParticipants = async (
  callId: string,
  accessToken: string
): Promise<ConferenceParticipant[]> => {
  const apiClient = new HttpClient();

  try {
    headers.Authorization = `Bearer ${accessToken}`;
    await apiClient.get(
      `/v2/calling/conference/participants?callId=${callId}`,
      headers
    );

    if (apiClient.success) {
      return apiClient.response as unknown as ConferenceParticipant[];
    }
  } catch (error) {
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

/**
 * Toggle mute for a conference participant
 */
export const toggleMuteConferenceParticipant = async (
  callId: string,
  accessToken: string,
  channel: string,
  mute: boolean
) => {
  const apiClient = new HttpClient();

  try {
    headers.Authorization = `Bearer ${accessToken}`;
    await apiClient.post(
      `/v2/calling/conference/toggle-mute`,
      { callId, channel, mute },
      headers
    );

    if (apiClient.success) {
      return apiClient.response as ToggleParticipantMuteBody;
    }
  } catch (error) {
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

/**
 * Remove a participant from a conference call
 */
export const bootConferenceParticipant = async (
  callId: string,
  accessToken: string,
  channel: string
) => {
  const apiClient = new HttpClient();

  try {
    headers.Authorization = `Bearer ${accessToken}`;
    await apiClient.post(
      `/v2/calling/conference/boot`,
      { callId, channel },
      headers
    );

    if (apiClient.success) {
      return apiClient.response as BootParticipantBody;
    }
  } catch (error) {
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};
