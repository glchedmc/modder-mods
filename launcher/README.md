# Saturn Client

Saturn Client (formerly Glass Launcher) is a macOS Minecraft Java launcher with a liquid-glass UI, built-in mod browser (Modrinth + CurseForge),
a Lunar-style companion mod, and **Grok Studio**: one-click "Upgrade to 26.3" ports of mods that have no 26.3 build.

Default target: **Minecraft 26.3** · Fabric Loader 0.20.1 · Fabric API 0.165.2+26.3 · Loom 1.19.3 · Gradle 9.8.2 · Java 25.

## Opening the unsigned Mac build

The app is not signed or notarized, so Gatekeeper will block a double-click the first time.

1. Extract `SaturnClient-0.1.3-arm64.tar.xz` (Apple silicon; double-click to extract).
2. Drag **Saturn Client.app** into `/Applications`.
3. **Right-click (Control-click) the app → Open → Open.** On recent macOS versions you may instead need
   System Settings → Privacy & Security → "Open Anyway".
4. If macOS says the app is "damaged", clear the quarantine flag:
   `xattr -dr com.apple.quarantine "/Applications/Saturn Client.app"`

## Keys and accounts (Settings → Accounts & Keys)

All user-entered keys are stored with Electron `safeStorage` (Keychain-backed on macOS). The UI only ever sees "set / not set".

| Key | Needed for | Default |
|---|---|---|
| xAI API key | Grok Studio ports | None — add yours from https://console.x.ai. The Upgrade button asks you to add it in Settings. |
| CurseForge API key | CurseForge search/installs (Modrinth works without a key) | A built-in key is packaged with the app. Your own key in Settings, if you add one, overrides it. |
| Azure client ID | Microsoft sign-in (online play) | `8e130755-4b0b-4252-bc49-40cfa995f0d3` (public). Settings can still override it. |

Without a Microsoft account the launcher can still start the game in **demo mode** (offline, demo world).

### Microsoft sign-in

A default Azure app ID is built in. New app IDs are blocked by Minecraft services until Mojang approves them
(https://aka.ms/mce-reviewappid). Until approval comes through, sign-in stops at the Minecraft step and the
launcher shows **Microsoft sign-in is waiting on Mojang approval.**

To use a different Azure app: register one at https://portal.azure.com → Microsoft Entra ID → App registrations
(Personal Microsoft accounts only, Allow public client flows = Yes) and paste the Application (client) ID into Settings.

The flow is device code → Xbox Live → XSTS → Minecraft services → entitlement and profile check. Tokens are kept in the secret store.

## What's new in 0.1.3

- **Renamed to Saturn Client** (bundle id `com.glchedmc.saturnclient`). On first launch, data in
  `~/Library/Application Support/Glass Launcher` moves to `~/Library/Application Support/Saturn Client`.
  The Keychain entry is new, so re-enter any API keys you had saved (the old encrypted file is kept as `secrets-legacy.bin`).
- **New icon:** the wireframe cube and faceted crystal with a glass Saturn ring. Settings → Appearance → Dock icon also offers
  the Wireframe and Crystal versions (changes the Dock icon while the app runs).
- **Microphone for voice chat:** `NSMicrophoneUsageDescription` and the `com.apple.security.device.audio-input` entitlement.
  The app asks once on first launch; Settings → Voice & Mic shows the status, re-asks, or opens System Settings.
  Minecraft runs as a child of Saturn Client, so Simple Voice Chat uses the launcher's permission. One-click Simple Voice Chat install.
- **Rename mods:** pencil (or double-click) in an instance's mod list. The name is stored in `instance.json`; "Rename file too"
  renames the jar safely (same folder and extension, no overwrite, `.disabled` kept). Undo from the toast; Reset restores the original name and file.
- **Collapsible sidebar:** toolbar button or ⌘\. Collapsed shows icons only or nothing (Settings → Appearance). Remembered.
- **Skins:** 3D preview (skinview3d) with idle/walk/run, classic/slim, a saved library, PNG upload or drag-and-drop, starter skins,
  "Wear in game" (the companion mod shows your library skin to you) and Apply to account (needs Microsoft sign-in).
- **AI skins:** Grok (`grok-imagine-image-2.0`) or ChatGPT (`gpt-image-1`) with your own API key (Keychain). Character mode asks for a
  front-view character and maps it onto the 64×64 layout; sheet mode (beta) asks for a skin sheet. Output is normalized to valid skin alpha rules.
- **Cosmetics:** six Saturn capes plus your own 64×32 capes, rendered in game by Saturn Client Companion 0.1.1 for you only.
  Hats and wings preview in the launcher. Other players don't see Saturn cosmetics (no shared cosmetics server yet).
- **Host World:** installs [e4mc](https://modrinth.com/mod/e4mc) (has 26.3 builds), launches the instance, and shows the public
  `*.e4mc.link` address from the game log after you Open to LAN. Paper/Purpur instances show LAN addresses and the port to forward.

## Features

- **Instances:** Vanilla, Fabric, Quilt, Forge and NeoForge clients, and Paper/Purpur servers (with a `start.command`).
  Java runtimes are downloaded automatically from Adoptium to match each version (Java 25 for 26.3).
- **Mods:** Modrinth and CurseForge search filtered by loader and version, install with required dependencies resolved,
  enable/disable, and compatibility status (ok / update / needs port / ported).
- **Backgrounds:** Settings → Appearance has a grid of original wallpapers grouped as Landscapes (variations of the blocky hills at different times of day and seasons), Solids (including a custom color), Gradients, and Other (aurora, glass flow, starfield, prism, soft mesh). You can also add your own image or video, and adjust blur, dim, and parallax. Each instance can inherit the app background, keep its generated cover art, or pick its own scene or file.
- **Schematics:** Per-instance library for `.litematic`, `.schem`, `.schematic` and `.nbt` files (the instance
  `schematics` folder, plus `config/worldedit/schematics` when present). Add via a file picker or drag-and-drop,
  remove with a confirm, and find new builds through [MineMev](https://minemev.com/developers/)'s public API
  (MineMev, Choculaterie, RedenMC, MCodex) with direct download into the instance. Suggests installing Litematica
  when a Fabric/Quilt instance doesn't have it.
- **Grok Studio:** gets the mod's source (linked GitHub repo, otherwise a Vineflower decompile), asks Grok
  (`grok-4.7`, Responses API) to port it to official Mojang names on Fabric 26.3, builds it with Gradle, sends
  compiler errors back to Grok (up to 5 attempts by default), then installs `*-grok.jar` and disables the old jar.
  Progress and the full log are streamed to the UI.
- **Saturn Client Companion mod** (Fabric 26.3, bundled): 36 toggleable QoL features in 6 groups (HUD, visuals,
  crosshair, tooltips, movement, performance), including compact tooltips, FPS/coords/armor/CPS HUDs, zoom,
  fullbright, toggle sprint/sneak and a custom crosshair. Every feature can be toggled in the launcher and in-game
  (**Right Shift**). Both write the same `config/glass-companion.json` file.

## Development

```bash
npm install
npm run dev            # Vite + Electron
npm test               # unit tests (node --test)
npm run build:mod      # builds companion-mod with Gradle 9.8.2 → resources/companion/
npm run screenshots    # headless UI screenshots (browser mock data)
npm run dist:mac       # unsigned arm64 + x64 zips in dist/ (run build:mod first so the companion jar is bundled)
node scripts/verify-fabric.js   # real end-to-end: create a Fabric 26.3 instance, download, build the launch command
```

Layout: `core/` holds the Electron-independent launcher logic (`LauncherService`), `electron/` the main and preload
processes (IPC allow-list), `renderer/` the React UI, and `companion-mod/` the Fabric mod.

## Status (v0.1.2)

Verified on a Linux box with no GPU: a Fabric 26.3 instance was created, its libraries and assets downloaded,
and the game launched through Fabric Loader 0.20.1 with 49 mods. The companion mod passed the mixin audit and
initialized all 36 features, then the game stopped at window creation as expected without a GPU. The
macOS arm64 launch command is generated correctly. Unit tests cover launch command generation, secrets, mods, and schematics.

Not yet tested or incomplete:
- The Grok port pipeline has not been run against the live xAI API (no key yet).
- Forge and NeoForge installer flows are implemented but not run end to end.
- Microsoft sign-in is implemented; the built-in Azure app ID is waiting on Mojang approval.
- In-game companion features have not been tested visually.
- The per-mod "Update" button only shows a notice. Modpack import is not implemented.
  ⌘K only opens Discover. CurseForge fingerprint matching is not implemented.
- Grok ports target Fabric/Quilt only.
