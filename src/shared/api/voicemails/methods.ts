import HttpClient from "shared/api/client/http-client.ts";
import { VoicemailMessage } from "shared/api/voicemails/types.ts";
import { Logger } from "shared/utils/Logger.ts";
import { APIError } from "shared/api/client/types/types.ts";

const headers = {
  Accept: "application/json",
  Authorization: "",
  "Content-Type": "application/json"
};

const logger = new Logger("Voicemails API");

export const getVoicemailMessages = async (accessToken: string) => {
  const apiClient = new HttpClient();

  try {
    headers.Authorization = `Bearer ${accessToken}`;

    await apiClient.get(`/v2/user-activity/voicemail-messages`, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as VoicemailMessage[];
    }
  } catch (error) {
    logger.error("getVoicemailMessages() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const getVoicemailMessage = async (accessToken: string, id: number) => {
  const apiClient = new HttpClient();

  try {
    headers.Authorization = `Bearer ${accessToken}`;

    await apiClient.get(`/v2/voicemail/messages/${id}`, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as VoicemailMessage;
    }
  } catch (error) {
    logger.error("getVoicemailMessage() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const updateVoicemailRead = async (
  accessToken: string,
  id: number,
  status: "read" | "unread"
) => {
  const apiClient = new HttpClient();

  const path = status === "read" ? "mark-read" : "mark-unread";
  try {
    headers.Authorization = `Bearer ${accessToken}`;

    await apiClient.patch(
      `/v2/voicemail/messages/${path}/${id}`,
      JSON.stringify({}),
      headers
    );

    if (apiClient.success) {
      return apiClient.response as unknown as { id: number };
    }
  } catch (error) {
    logger.error("updateVoicemailRead() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const deleteVoicemailMessage = async (
  accessToken: string,
  id: number
) => {
  const apiClient = new HttpClient();

  try {
    const headers = {
      Authorization: `Bearer ${accessToken}`
    };

    await apiClient.delete(`/v2/voicemail/messages/${id}`, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as { id: number };
    }
  } catch (e) {
    throw e as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const searchAllVoicemailMessages = async (query: string) => {
  const apiClient = new HttpClient();

  try {
    await apiClient.get(
      `/v2/user-activity/voicemail-messages/search?query=${query}`,
      headers
    );

    if (apiClient.success) {
      return apiClient.response as unknown as VoicemailMessage[];
    }
  } catch (error) {
    logger.error("searchAllVoicemailMessages() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};
