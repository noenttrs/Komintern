# Komintern Client

React + TypeScript frontend for the social deduction game.

## Stack

- React 18
- TypeScript (strict)
- Vite
- socket.io-client
- Semantic HTML only (no styling library)

## Prerequisites

- Node.js 24+
- npm 11+

## Install

```bash
cd client
npm install
```

## Run (dev)

```bash
npm run dev
```

By default, the client connects to the current page origin. Set `VITE_SERVER_URL` when the Socket.io server is on a different origin, such as local development.

If you enter room ID `test`, the client opens a local debug sandbox instead of the live Socket.io game. This is useful for solo round-by-round testing.

## Environment

Set the backend URL with Vite env vars:

```bash
# client/.env
VITE_SERVER_URL=http://localhost:3000
```

## Build

```bash
npm run build
npm run preview
```

## Scripts

- `npm run dev` (proxies `/socket.io` to the server on :3000)
- `npm test` (Vitest), `npm run lint` (ESLint + react-hooks), `npm run typecheck`

## Architecture

- `src/socket.ts`: singleton socket instance (`autoConnect: false`)
- `src/protocol.ts`: defensive parsing of server payloads, error translations
- `src/gameState.ts`: pure reducer turning server events into UI state
- `src/hooks/useGameSocket.ts`: connection, reconnection, per-tab identity, action queue
- `src/App.tsx`: screens

Identity is per browser tab (sessionStorage): a reload keeps the seat, and several tabs can
play as different players. Game actions sent while disconnected are queued and only emitted
once the server has confirmed the seat (`room_joined`).

The full event contract is documented in `../server/README.md`.
