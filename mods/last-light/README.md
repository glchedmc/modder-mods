# Last Light

When you die and respawn, Last Light reads the death position the game already stored and points you back to it. It does not pick up your items, build a grave, or keep them safe. The drops stay where they fell.

For a few minutes the action bar shows the distance and a compass direction. Walk into the spot and the guide stops. `/lastlight` prints the coordinates again and restarts the timer. If you logged out, the command still works, because the position lives on your player data.

A death in another dimension is reported with that dimension's id instead of a direction.

## Config

`config/last-light.json`

- `guideSeconds` (default 300) is how long the action bar keeps updating.
- `arrivalBlocks` (default 8) is how close you have to get.
- `guideOnRespawn` turns the automatic guide on or off. The command still works.

## Environment

Server-side. Multiplayer clients do not need the mod installed. Singleplayer loads it with the integrated server.
