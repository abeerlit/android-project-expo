import { ParsedUrlQueryInput } from "querystring";

export interface RequestHeaders {
  "Content-type"?:
    | "application/json"
    | "application/x-www-form-urlencoded"
    | "multipart/form-data";

  [key: string]: string | undefined;
}

export interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  params?: ParsedUrlQueryInput;
  headers?: RequestHeaders;
  requestTimeout?: number;
  noContentType?: boolean;
}

export interface HttpQuery<T = BodyInit_> {
  url: string;
  options: {
    method: RequestOptions["method"];
    headers: Headers;
    body?: T;
  };
}

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

export interface APIError {
  name: string;
  message: string;
  code: ErrorStatusCode;
}

export interface FormEncodedOptions {
  sorted?: boolean;
  skipIndex?: boolean;
  ignoreNull?: boolean;
  skipBracket?: boolean;
  useDot?: boolean;
  whitespace?: string;
}
