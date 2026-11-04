# Restock Chime

Use the chime on a villager to remember their current trades. The next time one of those trades is used up and then restocked, the chime rings once and names what came back. It does not trade for you, move the villager, or restock them early.

Sneak-use the chime to forget everyone you are watching. A plain use tells you how many villagers are on the list. You only hear the ring while the chime is in your pockets or your offhand, and only if that villager is loaded nearby.

The first time you watch a villager who has never opened their offers, those offers are chosen then, the same moment they would be chosen if you had traded. Watches last until you clear them or leave the world. Wandering traders are not villagers, so the chime ignores them.

## Recipe

Copper, an amethyst shard, and a stick. Repair it with copper. It also appears in the Tools and Utilities creative tab. Marking a villager spends one durability.

## Config

`config/restock-chime.json`

- `range` (default 32, max 64) how close you have to be to hear a restock
- `maxWatched` (default 8, max 24)
- `intervalTicks` (default 40) how often the list is checked

## Environment

Install it on both sides. The server keeps the watch list and sends the message.
