import HttpClient from "shared/api/client/http-client.ts";
import { ForwardingResponse } from "shared/api/user-settings/types.ts";
import { APIError } from "shared/api/client/types/types.ts";
import { Logger } from "shared/utils/Logger.ts";
import { FaxSettings, VoicemailSettings } from "shared/api/users/types.ts";

type ApiHeaders = {
  Accept: string;
  "Content-Type": string;
  Authorization?: string;
};

const headers: ApiHeaders = {
  Accept: "application/json",
  "Content-Type": "application/json",
  Authorization: ""
};

const logger = new Logger("User Settings API");

export const getFaxSettings = async (token: string) => {
  const apiClient = new HttpClient();
  headers.Authorization = `Bearer ${token}`;

  try {
    await apiClient.get(`/v2/users/user-settings/fax`, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as FaxSettings;
    }
  } catch (error) {
    logger.error("getFaxSettings() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const getVoicemailSettings = async (accessToken: string) => {
  const apiClient = new HttpClient();
  headers.Authorization = `Bearer ${accessToken}`;

  try {
    await apiClient.get(`/v2/users/user-settings/voicemail`, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as VoicemailSettings;
    }
  } catch (error) {
    logger.error("getVoicemailSettings() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const getForwardingSettings = async (accessToken?: string) => {
  const apiClient = new HttpClient();
  try {
    const requestHeaders = { ...headers };
    if (accessToken) {
      requestHeaders.Authorization = `Bearer ${accessToken}`;
    }

    await apiClient.get(
      `/v2/users/user-settings/extension-forwarding`,
      requestHeaders
    );

    if (apiClient.success) {
      return apiClient.response as unknown as ForwardingResponse;
    }
  } catch (error) {
    logger.error("getForwardingSettings() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const setExtensionForwarding = async (
  forwarding: boolean,
  number: string,
  accessToken?: string
) => {
  const apiClient = new HttpClient();
  try {
    const requestHeaders = { ...headers };
    if (accessToken) {
      requestHeaders.Authorization = `Bearer ${accessToken}`;
    }

    await apiClient.patch(
      `/v2/users/user-settings/extension-forwarding`,
      { number, disabled: !forwarding },
      requestHeaders
    );

    if (apiClient.success) {
      return apiClient.response as unknown as ForwardingResponse;
    }
  } catch (error) {
    logger.error("setExtensionForwarding() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};
