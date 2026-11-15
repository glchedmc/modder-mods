# Saturn Client

Saturn Client (formerly Glass Launcher) is a macOS and Linux Minecraft Java launcher with a liquid-glass UI, built-in mod browser (Modrinth + CurseForge),
a Lunar-style companion mod, and **Grok Studio**: one-click "Upgrade to 26.3" ports of mods that have no 26.3 build.

Default target: **Minecraft 26.3** · Fabric Loader 0.20.1 · Fabric API 0.165.2+26.3 · Loom 1.19.3 · Gradle 9.8.2 · Java 25.

## Opening the unsigned Mac build

The app is not signed or notarized, so Gatekeeper will block a double-click the first time.

1. Extract `SaturnClient-0.1.7-arm64.tar.xz` (Apple silicon; double-click to extract).
2. Drag **Saturn Client.app** into `/Applications`.
3. **Right-click (Control-click) the app → Open → Open.** On recent macOS versions you may instead need
   System Settings → Privacy & Security → "Open Anyway".
4. If macOS says the app is "damaged", clear the quarantine flag:
   `xattr -dr com.apple.quarantine "/Applications/Saturn Client.app"`

## Installing on Linux (x64)

Three builds, same app:

- **.deb** (Ubuntu, Debian, Mint, Pop!_OS): `sudo apt install ./SaturnClient-0.1.7-amd64.deb`, then open Saturn Client from the app menu.
- **AppImage** (any distro, built with `npm run dist:linux`): `chmod +x SaturnClient-0.1.7-x86_64.AppImage && ./SaturnClient-0.1.7-x86_64.AppImage`.
  If it complains about FUSE, install `libfuse2` (Ubuntu 24.04: `sudo apt install libfuse2t64`) or run it with `--appimage-extract-and-run`.
- **tar.gz**: extract anywhere and run `./saturn-client`.

Notes:
- Keys are encrypted with the desktop keyring (GNOME Keyring / KWallet via libsecret). With no keyring the app falls back to a
  private `0600` file in `~/.config/Saturn Client` and Settings → Accounts & Keys says so. Install `gnome-keyring` for encrypted storage.
- Java is downloaded automatically (Adoptium). Settings → Java → Detect also finds system JDKs in `/usr/lib/jvm`, `/opt`, `~/.jdks` and SDKMAN.
- Linux has no microphone prompt: PipeWire/PulseAudio give apps the mic directly. Settings → Voice & Mic → Sound settings opens your mixer.
- If panels feel slow on older GPUs or under a VM, turn **Settings → Appearance → Glass strength** down (0 = solid, no blur). Linux defaults to Medium.

## Keys and accounts (Settings → Accounts & Keys)

All user-entered keys are stored with Electron `safeStorage` (Keychain on macOS, libsecret keyring on Linux). The UI only ever sees "set / not set".

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

## What's new in 0.1.7: waypoints, resizable HUD, held item count, space title screen

- **Waypoints** (Lunar's Waypoints): **B** opens "New waypoint" at your feet (name, X/Y/Z, color); **J** opens the waypoint list
  to rename, recolor, hide/show, edit or delete. Waypoints are saved per world (singleplayer save) or server address, and per
  dimension, in `config/glass-companion-waypoints.json`. Each one gets a colored beacon beam (drawn at the edge of render distance
  when it is farther away) and a glass name + distance tag. Every death adds a red death waypoint (newest 5 kept).
  With the **Corner Atlas** mod installed, waypoints show as colored diamonds on its minimap (clamped to the rim when off-map).
  Toggles: Right Shift → Waypoints, or the launcher's Built-in mods page. Steps aside for Xaero's, JourneyMap and VoxelMap.
- **HUD editor resizing**: every element has corner handles; drag one to scale around the opposite corner, or scroll over an
  element to scale it (50–300%, snaps to 100%). Scale is saved per element (`hudLayout: {id: [x, y, scale]}`); right-click still
  resets position and size.
- **Held item count** (on by default): the total of the held item across your whole inventory (hold cobblestone → 342), arrows
  for a bow or crossbow, plus durability left on tools (green / gold / red, with a bar). Draggable and resizable.
- **Title screen**: Saturn's own space panorama (Saturn with rings, a moon, nebula and stars), shipped as the built-in
  "Saturn panorama" resource pack (on by default; turn it off in Resource Packs to get vanilla's back). The ring logo now sits on
  transparency, left of a giant **SATURN** title; buttons, glass panels and captions are a little brighter.

## What's new in 0.1.6: built-in mods (Lunar-style)

Saturn's companion mod (Fabric 26.3) now carries Lunar-style modules you toggle in game with **Right Shift**
or in the launcher under **Settings → Built-in mods** (per instance: **Instance → Built-in mods**).

- **Shulker box preview**: hover a shulker box to see its 9×3 contents, tinted to the box colour.
- **Armor status**: worn armor, main hand and offhand with durability as a number, percent or bar; gold under 50%, red under 20%. Vertical or horizontal.
- **HUD editor**: drag any HUD element (Pause → Edit HUD, or the button in the mod menu). Right-click resets one, "Reset all" resets everything.
- **Sound arrows** (Echo Arrow, off by default): with Subtitles on, each subtitle line gets a compass arrow turned to the sound's exact bearing,
  its distance and ▲/▼ when it is above or below you, instead of vanilla's `<` `>`. Modes: Ring (arrows around the crosshair), Subtitles, or Both.
- Also built in: freelook (hold Left Alt), block info, effect timers, item counter, death point, durability alert, saturation, day counter,
  chunk borders (F7), clear weather (visual), inventory sort, furnace gauge, keystrokes, CPS/FPS/coords and more.
- If a standalone copy of one of our mods (Echo Arrow, Brew Clock, Tidy Key, ...) is installed, its built-in module stays off so nothing doubles up.
- Not built in: Crate Glow and Wall Peek (ESP / x-ray style).
- **Saturn title screen and pause menu**: liquid glass panels, the Saturn ring logo and quick places (Singleplayer, Multiplayer, Friends,
  Mods, Settings, Quit). They follow **Settings → Appearance → Glass strength**; "Vanilla menu" is always one click away.
- **Performance pack** (on by default for Fabric/Quilt): Sodium, Lithium, FerriteCore, ImmediatelyFast, Entity Culling and Sodium Extra
  from Modrinth, only when they have a build for the instance's version. Toggle it globally or per instance. ModernFix is left out (no 26.3 build).
- **Versions**: Settings → General → Show snapshots / Old versions now drive the New Instance picker (old beta/alpha included). Java is picked
  from each version's manifest (Java 8 for old versions) and downloaded when missing. The loader picker greys out loaders with no build for the chosen version.

Dev checks: `node scripts/ingame-test.js <dataDir> "" <jdkDir>` builds a real `modder-test` instance (companion + performance pack) and starts it;
`node scripts/snapshot-test.js <dataDir>` launch-tests the newest snapshot on vanilla and Fabric.

## What's new in 0.1.5: Friends & chat

A **Friends** tab, Essential-style, with no Saturn server and nothing to pay for.

- **Add friends with a code.** Everyone gets a friend code like `SAT-7XK3-QF9D` (and a QR/npub). Paste a friend's code →
  Find → check the name → Send request. They accept in Friends → Requests.
- **Chat** with friends in the launcher. Messages are end-to-end encrypted and delivered even if your friend is offline
  (they arrive next time they open Saturn). Unread badges in the sidebar and dock, in-app toasts, and desktop notifications
  when Saturn is in the background (Settings → Friends).
- **Presence:** see who's online, in game (and which instance), or hosting.
- **Worlds with members, one-click join:** Friends → Worlds → Share a world: pick an instance and tick the friends who can join.
  Launch it and Open to LAN. Members see it go **Live** and click **Join**. Saturn swaps the Direct (P2P) codes for you over
  encrypted messages, opens the tunnel, and then **Play** launches their instance straight into your world (Quick Play).
  Voice chat goes through the same tunnel. Manual invite codes in Host World still work as a fallback.
- **Invites in chat:** "Invite to world" adds the friend as a member and drops an invite card with a Join button in your chat.

How it works: each install makes a [Nostr](https://nostr.com) key pair, kept in the keychain/libsecret like your other keys.
Messages are NIP-17 private messages: NIP-44 encrypted, sealed and gift-wrapped (NIP-59) with a throwaway key and a randomized
timestamp, and stored by several free public relays (default: nos.lol, relay.primal.net, nostr.mom, offchain.pub,
relay.damus.io; editable in Settings → Friends). Presence and join signaling use the same encryption in the ephemeral
event range, so relays forward them live and don't store them. Only accepted friends can message you or ask to join; a join is
only answered for members of that world while you're hosting.

Privacy and limits:
- Relays can't read messages or see who sent them, but they see your public key receiving encrypted events, roughly
  when, and your IP address (like any server you connect to). With "Findable by friend code" on, your display name and
  code are published so friends can look you up; turn it off and share your npub instead.
- Public relays are free and best-effort: they can rate-limit, go down, or delete old events. Saturn uses several at once.
- Friend codes are 8 characters (40 bits), so always check the name before sending a request; the full npub is exact.
- Chat history is stored only on this computer (`social.json`). A second computer is a separate identity.
- In-game chat overlay isn't included yet; you get desktop notifications while playing.

## What's new in 0.1.4

- **Linux build** (AppImage, .deb, tar.gz for x64). Same built-in CurseForge key; no new key needed.
- **Glass strength:** Settings → Appearance → Glass. Slider from Solid (no blur, opaque panels) to Max, quick Solid/Medium/Max
  buttons, and **Reduce transparency** to force solid panels. Applied live through CSS variables.
- **Host World, four ways** (pick one at the top of Host World):
  | Provider | Best for | Voice chat | Setup |
  |---|---|---|---|
  | **Direct (free)** (default) | Most friends | Yes, tunneled | Swap two codes, nothing else |
  | **Tailscale** | Regular group, strict networks | Yes | Both install Tailscale and share a tailnet |
  | **Own IP / port forward** | A stable address, many players | Yes (forward UDP 24454) | UPnP button or router port forwarding; optional DuckDNS name |
  | **e4mc quick link** | Quick public link, no setup for friends | No | Installs e4mc |
  - **Direct (free)** works like Essential: WebRTC (ICE + UDP hole punching through free public STUN servers, no relay).
    The host clicks **Create invite** and sends the code; the friend clicks **Join a friend**, pastes it, and sends back a reply code;
    the host pastes the reply. The friend then joins `localhost` in Multiplayer → Direct Connection. The game goes over a reliable
    data channel per connection and Simple Voice Chat UDP over a second unordered channel. The panel shows the connection type and
    your NAT type; strict (symmetric) NAT on both ends can't hole-punch, and the app suggests Tailscale or your own IP instead.
    One invite per friend; keep Saturn open while you play.
  - **Own IP:** shows your public, local and join address, maps TCP 25565 + UDP 24454 with UPnP (or shows router steps), detects
    CGNAT, and can keep a DuckDNS name pointed at your IP (token stored in the keyring).
  - **Tailscale:** detects the CLI/app, shows your MagicDNS name and Tailscale IP to share, with install/sign-in/invite links.
  - Paper and the new **Fabric server** instance type (vanilla dedicated server + Fabric Loader + Fabric API) work with all providers except e4mc.
- **Voice chat in one click:** Host World → Voice chat → **Enable voice chat** installs Simple Voice Chat (26.3 build from Modrinth)
  and writes `voice_host` for the provider: blank for Direct (each friend reaches voice through their tunnel) and LAN,
  your Tailscale address for Tailscale, your public IP or DNS name for Own IP. Each friend installs Simple Voice Chat in their own
  instance too (same button). Default push-to-talk is Caps Lock.
- **Skin editor:** paint on base or outer layer, pencil/eraser/fill/eyedropper, mirror left/right, grid, classic/slim, color
  picker with palette and recent colors, undo/redo (Ctrl/⌘+Z, Shift+Ctrl/⌘+Z), live 3D preview, PNG import/export, save or save a copy.
- **Load a player's skin** by username or UUID (Mojang profile + session server), open it in the editor, or save it to your library.
- Cmd/Ctrl+K opens Discover. On Linux the window uses the system title bar and shows Ctrl shortcuts.

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
npm run dist:linux     # AppImage + .deb + tar.gz (x64) in dist/
xvfb-run -a npx electron scripts/p2p-smoke.js --no-sandbox   # real WebRTC tunnel smoke test (TCP + UDP echo)
xvfb-run -a npx electron scripts/friends-smoke.js            # two installs: add by code, chat, one-click join (local relay; RELAYS=public for the real ones)
node scripts/social-live.js                                   # Friends signaling against the public relays
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
  CurseForge fingerprint matching is not implemented.
- Grok ports target Fabric/Quilt only.
- Direct (free) hosting was tested end to end over loopback (real WebRTC, TCP and UDP echo) but not across two real home
  networks: the test box blocks outbound UDP. There is no relay, so two strict/symmetric NATs can't connect (use Tailscale or Own IP).
- UPnP and DuckDNS were tested against a fake router; real router behaviour varies.
