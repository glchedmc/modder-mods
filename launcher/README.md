# Glass Launcher

A macOS Minecraft Java launcher with a liquid-glass UI, built-in mod browser (Modrinth + CurseForge),
a Lunar-style companion mod, and **Grok Studio**: one-click "Upgrade to 26.3" ports of mods that have no 26.3 build.

Default target: **Minecraft 26.3** · Fabric Loader 0.20.1 · Fabric API 0.165.2+26.3 · Loom 1.19.3 · Gradle 9.8.2 · Java 25.

## Opening the unsigned Mac build

The app is not signed or notarized, so Gatekeeper will block a double-click the first time.

1. Unzip `Glass Launcher-0.1.0-arm64-mac.zip` (Apple silicon) or `Glass Launcher-0.1.0-mac.zip` (Intel).
2. Drag **Glass Launcher.app** into `/Applications`.
3. **Right-click (Control-click) the app → Open → Open.** On recent macOS versions you may instead need
   System Settings → Privacy & Security → "Open Anyway".
4. If macOS says the app is "damaged", clear the quarantine flag:
   `xattr -dr com.apple.quarantine "/Applications/Glass Launcher.app"`

## Keys and accounts you provide (Settings → Accounts & Keys)

All keys are stored with Electron `safeStorage` (Keychain-backed on macOS). The UI only ever sees "set / not set".

| Key | Needed for | Where to get it |
|---|---|---|
| xAI API key | Grok Studio ports | https://console.x.ai → API Keys |
| CurseForge API key | CurseForge search/installs (Modrinth works without a key) | https://console.curseforge.com → API Keys |
| Azure client ID | Microsoft sign-in (online play) | see below |

Without a Microsoft account the launcher can still start the game in **demo mode** (offline, demo world).

### Microsoft sign-in: registering your own Azure app

Glass Launcher does not ship anyone else's client ID. To sign in:

1. Go to https://portal.azure.com → **Microsoft Entra ID → App registrations → New registration**.
2. Name it (e.g. "Glass Launcher"), choose **Personal Microsoft accounts only**, leave the redirect URI empty, and register.
3. In **Authentication**, set **Allow public client flows = Yes** (needed for the device-code flow). Save.
4. Copy the **Application (client) ID** into Settings → Accounts & Keys → Azure client ID.
5. New app IDs are blocked by Minecraft services until Mojang approves them. Apply at
   **https://aka.ms/mce-reviewappid**. Until approved, sign-in fails at the Minecraft step and the launcher shows
   an "app not approved" message.

The flow is device code → Xbox Live → XSTS → Minecraft services → entitlement and profile check. Tokens are kept in the secret store.

## Features

- **Instances:** Vanilla, Fabric, Quilt, Forge and NeoForge clients, and Paper/Purpur servers (with a `start.command`).
  Java runtimes are downloaded automatically from Adoptium to match each version (Java 25 for 26.3).
- **Mods:** Modrinth and CurseForge search filtered by loader and version, install with required dependencies resolved,
  enable/disable, and compatibility status (ok / update / needs port / ported).
- **Grok Studio:** gets the mod's source (linked GitHub repo, otherwise a Vineflower decompile), asks Grok
  (`grok-4.7`, Responses API) to port it to official Mojang names on Fabric 26.3, builds it with Gradle, sends
  compiler errors back to Grok (up to 5 attempts by default), then installs `*-grok.jar` and disables the old jar.
  Progress and the full log are streamed to the UI.
- **Glass Companion mod** (Fabric 26.3, bundled): 36 toggleable QoL features in 6 groups (HUD, visuals,
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

## Status (v0.1.0)

Verified on a Linux box with no GPU: a Fabric 26.3 instance was created, its libraries and assets downloaded,
and the game launched through Fabric Loader 0.20.1 with 49 mods. The companion mod passed the mixin audit and
initialized all 36 features, then the game stopped at window creation as expected without a GPU. The
macOS arm64 launch command is generated correctly. There are 16 unit tests, all passing.

Not yet tested or incomplete:
- The Grok port pipeline has not been run against the live xAI API (no key yet).
- Forge and NeoForge installer flows are implemented but not run end to end.
- Microsoft sign-in is implemented but untested; it needs an approved Azure client ID.
- In-game companion features have not been tested visually.
- The per-mod "Update" button only shows a notice. Modpack import is not implemented.
  ⌘K only opens Discover. CurseForge fingerprint matching is not implemented.
- Grok ports target Fabric/Quilt only.
