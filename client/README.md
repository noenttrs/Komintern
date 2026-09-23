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

## Architecture

- `src/socket.ts`: singleton socket instance (`autoConnect: false`)
- `src/hooks/useGameSocket.ts`: owns all socket listeners, state, and actions
- `src/components/*`: phase and screen components

There is no REST API usage in this client. Game state is driven entirely by Socket.io events.

## Events

### Client -> Server

- `join_room`
- `propose_team`
- `confidence_vote`
- `mission_vote`

### Server -> Client

- `room_joined`
- `game_started`
- `round_started`
- `team_proposed`
- `confidence_result`
- `mission_result`
- `game_over`
- `error`

## Notes

- Vote buttons are disabled immediately on click (one vote per phase UX).
- The client shows only the local player's role information.
- Socket listeners are cleaned up on unmount to prevent duplicate handlers.
- The hook normalizes payload key casing for compatibility with current server emissions.
