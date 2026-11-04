# Mile Spool

Use the spool to save the block at your feet. While you hold it, the action bar points toward that mark: distance, compass direction, and whether it is above or below you. Sneak-use clears the mark. The mark is stored on the spool, so another player holding it sees the same spot.

It does not point at your last death. That is what Last Light is for. One spool remembers one place. Craft another spool for another place.

If the mark is in another dimension, the spool names that dimension and the coordinates instead of a direction.

## Recipe

String and a compass. Repair it with string. Setting a mark spends durability. It also appears in the Tools and Utilities creative tab.

## Config

`config/mile-spool.json`

- `guideIntervalTicks` (default 20) how often the action bar refreshes
- `markDurability` (default 1) spent each time you set or move the mark

## Environment

Install it on both sides. The server writes the mark and sends the direction.
