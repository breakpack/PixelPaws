import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "http://localhost:8000",
});

api.interceptors.request.use((cfg) => {
  const token = import.meta.env.VITE_API_TOKEN as string | undefined;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});
