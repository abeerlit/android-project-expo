import HttpClient from "shared/api/client/http-client.ts";
import { AllActivity, UserCallData } from "shared/api/inbox/types.ts";
import { Fax } from "shared/api/faxes/types.ts";
import { APIError } from "shared/api/client/types/types.ts";
import { Logger } from "shared/utils/Logger.ts";

interface PaginationQuery {
  page: number;
  recordsPerPage: number;
}

const headers = {
  Accept: "application/json",
  Authorization: "",
  "Content-Type": "application/json"
};

const logger = new Logger("Inbox API");

export const getAllActivity = async (queryParams: Record<string, any>) => {
  const apiClient = new HttpClient();
  try {
    const queryString = Object.entries(queryParams)
      .map(([key, value]) => `${key}=${value}`)
      .join("&");

    await apiClient.get(
      `/v2/user-activity/recent-activity?${queryString}`,
      headers
    );

    if (apiClient.success) {
      return apiClient.response as unknown as AllActivity;
    }
  } catch (error) {
    logger.error("getAllActivity() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const getCalls = async (accessToken: string, query: PaginationQuery) => {
  const apiClient = new HttpClient();
  const { page = 1, recordsPerPage = 75 } = query;

  try {
    headers.Authorization = `Bearer ${accessToken}`;

    await apiClient.get(
      `/v2/user-activity/calls?page=${page}&recordsPerPage=${recordsPerPage}`,
      headers
    );

    if (apiClient.success) {
      return apiClient.response as unknown as UserCallData;
    }
  } catch (error) {
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const getMissedCalls = async (
  accessToken: string,
  query: PaginationQuery
) => {
  const apiClient = new HttpClient();
  const { page = 1, recordsPerPage = 75 } = query;

  try {
    headers.Authorization = `Bearer ${accessToken}`;

    await apiClient.get(
      `/v2/user-activity/missed-calls?page=${page}&recordsPerPage=${recordsPerPage}`,
      headers
    );

    if (apiClient.success) {
      return apiClient.response as unknown as UserCallData;
    }
  } catch (error) {
    logger.error("getMissedCalls() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const getRecordings = async (
  accessToken: string,
  query: PaginationQuery
) => {
  const apiClient = new HttpClient();

  const { page = 1, recordsPerPage = 75 } = query;

  try {
    headers.Authorization = `Bearer ${accessToken}`;

    await apiClient.get(
      `/v2/user-activity/recordings?page=${page}&recordsPerPage=${recordsPerPage}`,
      headers
    );

    if (apiClient.success) {
      return apiClient.response as unknown as UserCallData;
    }
  } catch (error) {
    logger.error("getRecordings() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const getFaxes = async (accessToken: string) => {
  const apiClient = new HttpClient();

  try {
    headers.Authorization = `Bearer ${accessToken}`;

    await apiClient.get(`/v2/user-activity/faxes`, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as Fax[];
    }
  } catch (error) {
    logger.error("getFaxes() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};
