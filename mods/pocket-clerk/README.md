# Pocket Clerk

Sort the items you are carrying, and file matching stacks into a container you already have open.

Pocket Clerk never rearranges a chest on its own. Sorting touches your pockets (the 27 storage slots, and the hotbar only if you opt in). Filing only moves items when that container already holds the same item, the same way you would top up a sorted cupboard. Armor and the offhand are left where they are.

## Keys

- **R** sorts your pockets.
- **G** files matching items into the container you have open.

Both keys work from the inventory screen and while you are looking at a chest. They are listed under **Pocket Clerk** in the controls menu.

## Config

`config/pocket-clerk.json` is written the first time the game loads.

- `sortHotbar` (default `false`) includes the hotbar when sorting.
- `quickStackHotbar` (default `false`) allows filing items out of the hotbar.

## Environment

The mod has to be installed on the client (for the keys) and on the server (the server checks the request and moves the items). A client cannot sort another player's inventory or a container they do not have open.
