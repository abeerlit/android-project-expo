import HttpClient from "shared/api/client/http-client.ts";
import {
  AgentQueues,
  CallQueue,
  QueueLoginResponse,
  QueueDNDResponse,
  QueuePauseResponse
} from "shared/api/queues/types.ts";
import { APIError } from "shared/api/client/types/types.ts";
import { Logger } from "shared/utils/Logger.ts";

const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
  Authorization: ""
};

const logger = new Logger("Queues API");

export const getAgentQueues = async (accessToken: string, peerName: string) => {
  const apiClient = new HttpClient();
  try {
    headers.Authorization = `Bearer ${accessToken}`;
    await apiClient.get(
      `/v2/queues/agent-status?peerName=${peerName}`,
      headers
    );

    if (apiClient.success) {
      return apiClient.response as unknown as AgentQueues;
    }
  } catch (error) {
    logger.error("getAgentQueues() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const getCallQueues = async (accessToken: string, tenantId: number) => {
  const apiClient = new HttpClient();
  try {
    headers.Authorization = `Bearer ${accessToken}`;
    await apiClient.get(`/v2/queues?tenantId=${tenantId}`, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as CallQueue[];
    }
  } catch (error) {
    logger.error("getCallQueues() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const queueAgentDND = async (
  peerName: string,
  queueId: number,
  dnd: boolean
) => {
  const apiClient = new HttpClient();
  try {
    await apiClient.post(
      `/v2/queues/agent-dnd`,
      { peerName, queueId, dnd: dnd ? 1 : 0 },
      headers
    );

    if (apiClient.success) {
      return apiClient.response as unknown as QueueDNDResponse;
    }
  } catch (error) {
    logger.error("queueAgentDND() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const queueAgentLogin = async (peerName: string) => {
  const apiClient = new HttpClient();
  try {
    await apiClient.post(
      `/v2/queues/agent-login`,
      { peerName, loggedIn: 1 },
      headers
    );

    if (apiClient.success) {
      return apiClient.response as unknown as QueueLoginResponse;
    }
  } catch (error) {
    logger.error("queueAgentLogin() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const queueAgentPause = async (
  peerName: string,
  paused: 1 | 0,
  pauseReason: string
) => {
  const apiClient = new HttpClient();
  try {
    await apiClient.post(
      `/v2/queues/agent-pause`,
      { peerName, paused, pauseReason },
      headers
    );

    if (apiClient.success) {
      return apiClient.response as unknown as QueuePauseResponse;
    }
  } catch (error) {
    logger.error("queueAgentPause() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};
