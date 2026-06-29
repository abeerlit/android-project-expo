import { APIError } from "./types/types.ts";
import { API_URL } from "@env";

export type APIRequestHeaders = {
  Authorization?: string;
  Accept?: string;
  "Content-Type"?: string;
};

export type ErrorStatusCode =
  | 400
  | 401
  | 402
  | 403
  | 404
  | 405
  | 406
  | 408
  | 409
  | 410
  | 411
  | 412
  | 413
  | 414
  | 415
  | 416
  | 421
  | 429
  | 500
  | 501
  | 502
  | 503
  | 504
  | 505
  | 507;

export type RequestMethod = "POST" | "GET" | "PATCH" | "DELETE" | "PUT";

export type RequestBody = {
  method: RequestMethod;
  headers: APIRequestHeaders;
  body?: any;
};

const unexpectedError: APIError = {
  name: "Error",
  message: "An unexpected error occurred",
  code: 500
};

/* HTTP Client

This client is designed to be used directly with VOXO API endpoints. It is a wrapper around the Fetch API.
It expects json responses from the server.

*/

export default class HttpClient {
  public success: boolean = false;
  public code?: number;
  public response: any;

  // Send a Request With Fetch API
  request = async (
    url: string,
    body: any,
    headers: APIRequestHeaders,
    method: RequestMethod
  ): Promise<void> => {
    const requestBody: RequestBody = {
      method,
      headers
    };

    try {
      if (method === "POST" || method === "PATCH" || method === "PUT") {
        if (!(body instanceof FormData)) {
          requestBody.body = JSON.stringify(body);
        } else {
          requestBody.body = body;
        }
      }

      const response = await fetch(API_URL + url, requestBody);
      await this.handleResponse(response);
    } catch {
      throw unexpectedError;
    }
  };

  delete = async (url: string, headers: APIRequestHeaders): Promise<void> => {
    try {
      await this.request(url, {}, headers, "DELETE");
    } catch (error) {
      throw error as unknown as APIError;
    }
  };

  get = async (url: string, headers: APIRequestHeaders): Promise<void> => {
    try {
      await this.request(url, {}, headers, "GET");
    } catch (error) {
      throw error as unknown as APIError;
    }
  };

  patch = async (
    url: string,
    body: any,
    headers: APIRequestHeaders
  ): Promise<void> => {
    try {
      await this.request(url, body, headers, "PATCH");
    } catch (error) {
      throw error as unknown as APIError;
    }
  };

  post = async (
    url: string,
    body: any,
    headers: APIRequestHeaders
  ): Promise<void> => {
    try {
      await this.request(url, body, headers, "POST");
    } catch (error) {
      throw error as unknown as APIError;
    }
  };

  put = async (
    url: string,
    body: any,
    headers: APIRequestHeaders
  ): Promise<void> => {
    try {
      await this.request(url, body, headers, "PUT");
    } catch (error) {
      throw error as unknown as APIError;
    }
  };

  handleResponse = async (response: Response): Promise<void> => {
    this.response = await response.json();
    this.success = response.ok;
    this.code = response.status;
  };
  status: any;
}
