# Mote Charm

Use the charm to shrink for ten seconds. Your hitbox shrinks with you, using the same scale value the game already uses for slime size, so a one-block gap is enough to walk through. Sneak-use to grow back early.

When the time runs out, the charm waits if growing would leave you inside a block. Dig a space, or sneak-use again once you have room. It will not shrink you while you are riding something.

This shrinks you. It does not shrink mobs.

## Recipe

An amethyst shard, a slimeball, and gold. Repair it with amethyst. It also appears in the Tools and Utilities creative tab.

## Config

`config/mote-charm.json`

- `scale` (default 0.4, between 0.3 and 0.7) your size while the charm is working
- `durationTicks` (default 200) how long you stay small
- `cooldownTicks` (default 80) rest time after you grow back
- `durability` (default 2) spent each time you shrink

## Environment

Install it on both sides. The server applies the scale. The client needs the item model.
