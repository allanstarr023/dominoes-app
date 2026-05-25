# Dominoes App

Core rule engine for a 4-player double-six dominoes game.

This first step is intentionally UI-free. The project now has pure logic for the rules, match lifecycle, and invite-room flow. The multiplayer server and browser app can build on these functions.

## Commands

```powershell
npm test
npm start
```

## Implemented Rules

- 4 players, no partnerships.
- Double-six tile set, 7 tiles per player, no boneyard.
- First game starts with `6:6`.
- Later games start with the previous winner using any tile.
- A deal is squashed if any player receives 5 or more doubles.
- Turn timeout chooses the lowest legal tile automatically.
- Ranking uses lowest pip total, then fewer tiles, then pip rank.
- Mandatory locks score like a 5-point first-place win.
- Successful regular locks score 6 for the locking player.
- Failed regular locks give the locking player 0 and rank the other players normally.
- Every 2 timeout/autoplay infractions subtracts 1 match point.

## Modules

- `src/dominoesEngine.js`: tile set, legal moves, autoplay, locks, ranking, game scoring.
- `src/matchEngine.js`: match length, turn order, timer deadlines, infractions, pause/resume, chat, standings.
- `src/roomEngine.js`: invite room, 4-player seating, match start, disconnect/reconnect routing.
- `src/appServer.js`: HTTP API, static client serving, Server-Sent Events, turn timeout scheduling.
- `public/`: PWA-ready browser client for room creation, joining, gameplay, timer display, scoring, and chat.

## Board Interaction

- The board tracks only two playable open ends: left and right.
- A played tile is stored in its real board orientation.
- Left-end plays are inserted at the left side of the chain.
- Right-end plays are appended at the right side of the chain.
- Players select a playable tile, then tap the legal left/right board target.
- On desktop, playable tiles can also be dragged onto the legal left/right board target.
- Unplayable tiles are greyed out and cannot be selected.
- Dominoes render with pip dots, with doubles standing vertically across the chain.
- The board renders as a centered chain instead of using a horizontal scrollbar.

## Host Controls

- The player who creates the room is the host.
- Only the host can start the match.
- Only the host can end the session.
- Ending a session cancels any active match, clears the turn timer, notifies connected players, closes room event streams, and removes the room from server memory.
