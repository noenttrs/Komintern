import { io } from "socket.io-client";

const defaultServerUrl =
  typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:3000";

// `||` et non `??` : une variable définie mais vide doit retomber sur la même origine.
const serverUrl = import.meta.env.VITE_SERVER_URL || defaultServerUrl;

export const socket = io(serverUrl, {
  autoConnect: false,
});
