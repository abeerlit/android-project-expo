import HttpClient from "../client/http-client.ts";
import { APIError } from "../client/types/types.ts";
import { Logger } from "shared/utils/Logger.ts";
import { TenantSettingsResponse } from "./types.ts";

const logger = new Logger("Tenant API: ");

// Base Headers
const headers = {
  Accept: "application/json",
  Authorization: "",
  "Content-Type": "application/json"
};

// Get tenant by ID
export const getTenantById = async (
  accessToken: string,
  tenantId: number
): Promise<any> => {
  logger.debug("getTenantById(): ", tenantId);
  const apiClient = new HttpClient();

  try {
    headers.Authorization = `Bearer ${accessToken}`;
    await apiClient.get(`/v2/admin/tenants/${tenantId}`, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as any;
    }
  } catch (error) {
    logger.error("getTenantById() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

// Get tenant settings
export const getTenantSettings = async (
  accessToken: string,
  tenantId: number
): Promise<TenantSettingsResponse> => {
  logger.debug("getTenantSettings(): ", tenantId);
  const apiClient = new HttpClient();

  try {
    headers.Authorization = `Bearer ${accessToken}`;
    await apiClient.get(`/v2/tenants/${tenantId}/settings`, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as TenantSettingsResponse;
    }
  } catch (error) {
    logger.error("getTenantSettings() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};
