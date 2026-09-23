import { io } from "socket.io-client";

const defaultServerUrl =
  typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:3000";

const serverUrl = import.meta.env.VITE_SERVER_URL ?? defaultServerUrl;

export const socket = io(serverUrl, {
  autoConnect: false,
});
