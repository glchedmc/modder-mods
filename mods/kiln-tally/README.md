# Kiln Tally

Use the tally on a furnace, smoker, or blast furnace. It tells you what is cooking, what is fueling it, what has finished, and whether the fire is lit. It does not open the furnace, and it does not touch the input or the fuel.

Sneak-use takes the finished stack into your pockets. If your pockets are full, the rest stays in the furnace. You have to be close enough to open that furnace yourself.

Right-clicking anything else still opens it, the way it normally would.

## Recipe

Paper, copper, and a stick. Repair it with copper. It also appears in the Tools and Utilities creative tab.

## Config

`config/kiln-tally.json`

- `lookDurability` (default 1) spent when you read a furnace
- `takeDurability` (default 1) spent when you take the output
- `cooldownTicks` (default 8)

## Environment

Install it on both sides. The server reads the furnace and moves the output.
