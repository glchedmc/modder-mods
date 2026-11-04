# Stack Lure

The stack lure tugs dropped items toward you, but only ones you are already carrying and only when that stack still has room. A new kind of item stays on the ground. Sneak, and the lure lets go so you can toss something away.

Use the lure to quiet it. Use it again to draw. The quiet flag is stored on the item.

This is not a vacuum. It will not empty a chest, pull another player's fresh toss (those still have their pickup delay), or sweep the floor of things you have not picked up yet.

## Recipe

Iron, lead, and a slimeball. It also appears in the Tools and Utilities creative tab.

## Config

`config/stack-lure.json`

- `radius` (default 5.5, max 12) how far a drop can be
- `speed` (default 0.32) pull speed
- `intervalTicks` (default 4) time between tugs
- `maxPerPass` (default 8) drops moved in one pass
- `pullFullStacks` (default `false`) also pulls when every matching stack is already full

## Environment

Install it on both sides. The server decides which drops move. The client shows the item and the tooltip.
