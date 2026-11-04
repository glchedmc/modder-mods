# modder-mods

Fabric mods for Minecraft Java **26.3**, built with Fabric Loader **0.20.1**, Loom **1.19-SNAPSHOT**, and Fabric API **0.165.2+26.3**. Official Mojang mappings. Java 25.

Each mod is its own Gradle subproject under `mods/` and can be published on its own. `smoke-test/` is a dev-only server harness and is not a release mod.

## Mods

| Mod | What it does |
| --- | --- |
| [Pocket Clerk](mods/pocket-clerk/README.md) | Sorts your pockets, and files matching stacks into a container you already have open. |
| [Fray Bell](mods/fray-bell/README.md) | Rings once when a held tool or armor piece crosses a wear threshold. |
| [Kindling Notes](mods/kindling-notes/README.md) | Tooltip lines for food, fuel, compost, repair, and remaining wear. Client only. |
| [Row Again](mods/row-again/README.md) | Replants a mature crop from the harvest. Sneak to clear the row. |
| [Last Light](mods/last-light/README.md) | After you die, points you back to the spot. It does not move your items. |
| [Salvage Hook](mods/salvage-hook/README.md) | Pulls you to a block and tugs dropped items along the rope. |
| [Seam Pick](mods/seam-pick/README.md) | Follows one vein of the same block, and spends hunger and durability to do it. |
| [Tide Wand](mods/tide-wand/README.md) | Launches you, or opens a short well that gathers drops and lifts you a little. |
| [Stack Lure](mods/stack-lure/README.md) | Draws in dropped items only when you already have a stack with room for them. |
| [Restock Chime](mods/restock-chime/README.md) | After you mark a villager, rings once when one of their trades restocks. |
| [Mile Spool](mods/mile-spool/README.md) | Remembers one spot on the spool and points you back while you hold it. |
| [Kiln Tally](mods/kiln-tally/README.md) | Reads a furnace, smoker, or blast furnace, and can take what is finished. |
| [Dusk Survey](mods/dusk-survey/README.md) | Counts nearby spots where a hostile mob could spawn in the dark. |
| [Mote Charm](mods/mote-charm/README.md) | Shrinks you for a short while so you can fit through a one-block gap. |
| [Swap Baton](mods/swap-baton/README.md) | Trades a full block in the world for the block in your other hand. |
| [Reed Kite](mods/reed-kite/README.md) | Slows a fall and lets you drift while you hold it. Sneak to drop. |

## Build

```
./gradlew build
```

Jars land in `mods/<mod-id>/build/libs/<mod-id>-1.0.0.jar`.

Headless startup check, with every mod on the server classpath:

```
./gradlew :smoke-test:runServer
```

The server run writes `eula=true` for that dev folder before it starts.
