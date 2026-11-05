# Salvage Hook

The salvage hook is a rope with an iron bill. Use it while looking at a block within range and it pulls you to that face. Dropped items near the rope are tugged toward you. Living things are left alone: this is a recovery tool, not a weapon.

Each cast spends durability and starts a short cooldown. Repair it with iron ingots. The recipe is an iron ingot, a lead, and a stick.

## Config

`config/salvage-hook.json`

- `range` (default 24, clamped to 4–48)
- `cooldownTicks` (default 15)
- `durabilityCost` (default 1)
- `maxSpeed` (default 1.7) caps how hard the rope yanks

## Environment

Install it on both the client and the server. The server decides the pull. The client shows the model, texture, and tooltip.
