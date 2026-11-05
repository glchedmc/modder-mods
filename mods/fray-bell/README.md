# Fray Bell

Fray Bell rings once when something you are wearing or carrying crosses a wear line. It does not print a durability number on every item, and it does not ring again until that piece is repaired past the line and wears back down.

Default lines are 25%, 10%, and 5% remaining. The notice is an action-bar line plus a soft bell, so a dedicated server can run the mod without a matching client install. Clients still need the mod only if you want the language file; the action bar uses a vanilla packet.

Checked by default: the item in your hand, the hotbar, armor, and the offhand. Creative inventories are ignored because those items do not wear.

## Config

`config/fray-bell.json`

- `thresholds`: remaining-durability fractions, lowest first. Values outside (0, 1) are dropped.
- `checkArmor`, `checkHotbar`, `checkHand`: which slots to watch.

## Environment

Server logic. The mod loads on both sides so singleplayer works. A dedicated server can run it alone.
