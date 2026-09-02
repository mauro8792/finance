export const HEALTH_STATUS_OK = "ok";

export type HealthResponse = {
  status: string;
};

export type ApiErrorBody = {
  code: string;
  message: string;
};

export type ApiErrorResponse = {
  error: ApiErrorBody;
};
