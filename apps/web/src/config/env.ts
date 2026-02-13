export const ENV = {
  API_URL: import.meta.env.VITE_API_BASE_URL,
  WS_URL: import.meta.env.VITE_WS_URL,
  CODE_EXECUTION_SOCKET_URL: import.meta.env.VITE_CODE_EXECUTION_SOCKET_URL,
} as const;
