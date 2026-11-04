# Seam Pick

The seam pick is an iron-tier pickaxe that keeps going through one connected body of the same block: an iron ore vein stays iron ore, and deepslate iron ore is a different seam. Sneak to mine a single block.

Every extra block costs extra durability and hunger. The seam stops when you are down to six hunger points, the pick is about to break, or the configured cap is reached. It will not follow chests, spawners, budding amethyst, or reinforced deepslate, and it only breaks blocks a pick is meant to harvest.

This is a tool with a cost, not an enchantment. It does not bank mining credits or gate ores behind dirt.

## Recipe

Iron, redstone, and sticks. Repair it with iron ingots. It also appears in the Tools and Utilities creative tab.

## Config

`config/seam-pick.json`

- `maxExtraBlocks` (default 24, max 64)
- `extraDurability` (default 2) spent on each block after the one you broke
- `exhaustion` (default 0.4) added per extra block
- `minFood` (default 6) where the seam gives up
- `maxDistance` (default 16) keeps the search near the first block

## Environment

Install it on both sides so the item, model, and mining rule agree.
