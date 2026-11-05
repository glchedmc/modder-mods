# Kindling Notes

Kindling Notes adds a few plain lines to item tooltips, using data the item already carries:

- food points and saturation
- whether the item is furnace fuel
- whether it can go in a composter
- whether it has a repair ingredient
- remaining wear, written once as `left / max` rather than a bar on the hotbar

Nothing here changes hunger, smelting, or composting. It is a reading aid. Install it on the client only; a dedicated server does not load it.

## Config

`config/kindling-notes.json` has a boolean for each line: `showFood`, `showFuel`, `showCompost`, `showRepair`, `showDurability`.
