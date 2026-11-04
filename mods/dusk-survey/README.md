# Dusk Survey

Use the survey to count places near you where a hostile mob would be allowed to spawn: a legal floor, room for the mob, and block light at zero. It ignores sunlight, so you can check a cave or a camp at noon and still see the spots that will matter after dark.

The chat line names how many spots it found, where the nearest one is, and whether the block under your feet is one of them. A short puff of smoke marks up to eight of the closest spots. It does not stop spawns and it does not light anything.

This is a single look, not a light-level overlay.

## Recipe

Copper, glowstone dust, and iron. Repair it with amethyst shards. It also appears in the Tools and Utilities creative tab.

## Config

`config/dusk-survey.json`

- `radius` (default 8, max 12) horizontal reach
- `vertical` (default 3, max 6) blocks above and below your feet
- `maxBlockLight` (default 0) spots at or under this block light are counted
- `cooldownTicks` (default 30)
- `showParticles` (default `true`)
- `durability` (default 1) spent per survey

## Environment

Install it on both sides. The server does the scan, because light and spawn checks belong there.
