# Row Again

Break a fully grown crop and Row Again puts one plant back, paid for with a seed from the drops or from your inventory. Sneak while harvesting when you want the row cleared instead.

It waits one tick so the dropped seeds exist, then replants only if the spot is still empty and the plant can live there (farmland, soul sand, or a jungle log for cocoa). Immature crops are left alone, so you can still knock out a young plant to redesign a field.

Supported plants: wheat, carrots, potatoes, beetroot, torchflowers, nether wart, and cocoa.

## Config

`config/row-again.json`

- `enabled` turns replanting on or off.
- `sneakSkips` (default `true`) lets you crouch to harvest without replanting.

## Environment

The replant happens on the server. Clients do not need the mod for it to work in multiplayer.
