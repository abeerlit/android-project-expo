import HttpClient from "../client/http-client.ts";
import { APIError } from "shared/api/client/types/types.ts";
import {
  CompanyContact,
  DirectoryContact,
  PersonalContact,
  RecentContact
} from "shared/api/directory/types.ts";
import { Logger } from "shared/utils/Logger.ts";

const logger = new Logger("Directory API");

interface Headers {
  "Content-Type"?: string;
  Authorization: string;
  Accept?: string;
}

const headers: Headers = {
  Accept: "application/json",
  Authorization: "",
  "Content-Type": "application/json"
};

export const getDirectory = async (token: string) => {
  const apiClient = new HttpClient();
  try {
    headers.Authorization = `Bearer ${token}`;
    await apiClient.get(`/v2/directory`, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as DirectoryContact[];
    }
  } catch (error) {
    logger.error("getDirectory() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const getPersonalContacts = async (accessToken: string) => {
  const apiClient = new HttpClient();
  try {
    headers.Authorization = `Bearer ${accessToken}`;
    await apiClient.get(`/v2/directory/personal`, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as PersonalContact[];
    }
  } catch (error) {
    logger.error("getPersonalContacts() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const getCompanyContacts = async (accessToken: string) => {
  const apiClient = new HttpClient();
  try {
    headers.Authorization = `Bearer ${accessToken}`;

    await apiClient.get(`/v2/directory/company`, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as CompanyContact[];
    }
  } catch (error) {
    logger.error("getCompanyContacts() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const createPersonalContact = async (token: string, data: FormData) => {
  const apiClient = new HttpClient();
  try {
    headers.Authorization = `Bearer ${token}`;
    headers["Content-Type"] = "multipart/form-data";

    await apiClient.post(`/v2/directory/personal`, data, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as PersonalContact;
    }
  } catch (error) {
    logger.error("createPersonalContact() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const patchPersonalContact = async (
  token: string,
  id: number,
  data: FormData
) => {
  const apiClient = new HttpClient();
  try {
    headers.Authorization = `Bearer ${token}`;
    headers["Content-Type"] = "multipart/form-data";

    await apiClient.patch(`/v2/directory/personal/${id}`, data, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as PersonalContact;
    }
  } catch (error) {
    logger.error("patchPersonalContact() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const removePersonalContactAvatar = async (
  token: string,
  id: number,
  data: any
) => {
  const apiClient = new HttpClient();
  try {
    headers.Authorization = `Bearer ${token}`;

    await apiClient.patch(`/v2/directory/remove-avatar/${id}`, data, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as PersonalContact;
    }
  } catch (error) {
    logger.error("patchPersonalContact() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const deletePersonalContact = async (token: string, id: number) => {
  const apiClient = new HttpClient();

  try {
    headers.Authorization = `Bearer ${token}`;
    const headersCopy = { ...headers };
    delete headersCopy["Content-Type"];
    delete headersCopy["Accept"];

    await apiClient.delete(`/v2/directory/personal/${id}`, headersCopy);

    if (apiClient.success) {
      return apiClient.response as unknown as CompanyContact;
    }
  } catch (error) {
    logger.error("deletePersonalContact() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const getRecentContacts = async () => {
  const apiClient = new HttpClient();
  try {
    await apiClient.get(`/v2/user-activity/recent-contacts`, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as RecentContact[];
    }
  } catch (error) {
    logger.error("getRecentContacts() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const getCompanyContactById = async (id: number) => {
  const apiClient = new HttpClient();

  try {
    await apiClient.get(`/v2/directory/company/ext/${id}`, {});

    if (apiClient.success) {
      return apiClient.response as unknown as CompanyContact;
    }
  } catch (error) {
    logger.error("getCompanyContactById() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};

export const getPersonalContactById = async (token: string, id: number) => {
  const apiClient = new HttpClient();

  try {
    headers.Authorization = `Bearer ${token}`;
    await apiClient.get(`/v2/directory/personal/${id}`, headers);

    if (apiClient.success) {
      return apiClient.response as unknown as CompanyContact;
    }
  } catch (error) {
    logger.error("getPersonalContactById() error: ", error);
    throw error as unknown as APIError;
  }

  throw apiClient.response as unknown as APIError;
};
