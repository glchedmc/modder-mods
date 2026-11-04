# Swap Baton

Use the baton on a full block while you hold a different block in the other hand. The world block comes into your pockets, and the block you were holding takes its place. Shared properties, such as the axis of a log, are kept when both blocks have them.

The baton refuses anything that would be a bad trade. Chests, spawners, and other blocks with inventories stay put. Ores, ancient debris, budding amethyst, reinforced deepslate, and infested blocks stay put. Bedrock and other unbreakable blocks stay put. Slabs, stairs, and doors are not full cubes, so they stay put too. You still need permission to build there, and you have to be within reach.

It spends one of the block in your other hand. If your pockets cannot hold the block that came out, that block pops into the world.

## Recipe

A brick, iron, and a stick. Repair it with iron. It also appears in the Tools and Utilities creative tab.

## Config

`config/swap-baton.json`

- `reach` (default 6, max 8)
- `durability` (default 1) spent per swap
- `cooldownTicks` (default 6)

## Environment

Install it on both sides. The server checks the blocks and does the swap.
