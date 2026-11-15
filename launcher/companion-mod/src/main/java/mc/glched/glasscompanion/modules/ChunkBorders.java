package mc.glched.glasscompanion.modules;

import mc.glched.glasscompanion.CompanionConfig;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;

/** From Chunk Lines: world-space chunk borders; F7 cycles off, this chunk, loaded area. */
public final class ChunkBorders {
	enum Mode {
		OFF("Chunk borders off"), CURRENT("Chunk borders: this chunk"), LOADED("Chunk borders: loaded area");

		final String message;

		Mode(String message) {
			this.message = message;
		}

		Mode next() {
			return values()[(ordinal() + 1) % values().length];
		}
	}

	private static final ChunkBorderLines RENDERER = new ChunkBorderLines();
	private static Mode mode = Mode.CURRENT;

	private ChunkBorders() {
	}

	public static void cycle(Minecraft client) {
		if (!CompanionConfig.module("chunkBorders")) {
			return;
		}
		mode = mode.next();
		if (client.player != null) {
			client.player.sendOverlayMessage(Component.literal(mode.message));
		}
	}

	public static void tick(Minecraft client) {
		if (!CompanionConfig.module("chunkBorders") || client.level == null || client.player == null || mode == Mode.OFF) {
			RENDERER.clearCache();
			return;
		}
		if (mode == Mode.LOADED) {
			RENDERER.refreshLoadedCache(client);
		}
	}

	public static void emit() {
		if (CompanionConfig.module("chunkBorders")) {
			RENDERER.emit(Minecraft.getInstance(), mode);
		}
	}
}
