package mc.glched.glasscompanion;

import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.blaze3d.platform.NativeImage;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.core.ClientAsset;
import net.minecraft.resources.Identifier;

/**
 * Saturn Client cosmetics, rendered client-side for the local player only.
 * The launcher writes config/glass-companion-cosmetics.json and the cape PNG
 * (64x32 cape layout) next to it; this class reloads them when they change.
 */
public final class Cosmetics {
	private static long lastModified = -2;
	private static int generation;
	private static ClientAsset.Texture cape;
	private static boolean capeOnElytra = true;
	private static ClientAsset.Texture skin;
	private static boolean slim;

	private Cosmetics() {
	}

	private static Path dir() {
		return FabricLoader.getInstance().getConfigDir();
	}

	public static Path file() {
		return dir().resolve("glass-companion-cosmetics.json");
	}

	/** Called every couple of seconds from the client tick (render thread). */
	public static void reloadIfChanged() {
		try {
			Path path = file();
			long mod = Files.exists(path) ? Files.getLastModifiedTime(path).toMillis() : -1;
			if (mod == lastModified) return;
			lastModified = mod;
			cape = null;
			skin = null;
			if (mod < 0) return;
			JsonObject root;
			try (Reader r = Files.newBufferedReader(path)) {
				root = JsonParser.parseReader(r).getAsJsonObject();
			}
			loadSkin(root);
			if (!root.has("cape") || !root.get("cape").isJsonObject()) return;
			JsonObject c = root.getAsJsonObject("cape");
			if (c.has("enabled") && !c.get("enabled").getAsBoolean()) return;
			capeOnElytra = !c.has("elytra") || c.get("elytra").getAsBoolean();
			String name = c.has("file") ? c.get("file").getAsString() : "glass-companion-cape.png";
			if (name.contains("/") || name.contains("\\") || name.contains("..")) return;
			Path png = dir().resolve(name);
			if (!Files.exists(png)) return;
			NativeImage image = NativeImage.read(Files.readAllBytes(png));
			Identifier id = GlassCompanion.id("cosmetics/cape_" + (++generation));
			Minecraft.getInstance().getTextureManager().register(id, new DynamicTexture(() -> "glass-companion cape", image));
			cape = new Tex(id);
			GlassCompanion.LOGGER.info("[glass-companion] cosmetic cape loaded ({}x{})", image.getWidth(), image.getHeight());
		} catch (Exception ex) {
			cape = null;
			GlassCompanion.LOGGER.warn("[glass-companion] could not load cosmetics", ex);
		}
	}

	private static void loadSkin(JsonObject root) {
		try {
			if (!root.has("skin") || !root.get("skin").isJsonObject()) return;
			JsonObject c = root.getAsJsonObject("skin");
			if (!c.has("enabled") || !c.get("enabled").getAsBoolean()) return;
			String name = c.has("file") ? c.get("file").getAsString() : "glass-companion-skin.png";
			if (name.contains("/") || name.contains("\\") || name.contains("..")) return;
			Path png = dir().resolve(name);
			if (!Files.exists(png)) return;
			NativeImage image = NativeImage.read(Files.readAllBytes(png));
			Identifier id = GlassCompanion.id("cosmetics/skin_" + (++generation));
			Minecraft.getInstance().getTextureManager().register(id, new DynamicTexture(() -> "saturn skin", image));
			skin = new Tex(id);
			slim = c.has("slim") && c.get("slim").getAsBoolean();
		} catch (Exception ex) {
			skin = null;
			GlassCompanion.LOGGER.warn("[glass-companion] could not load local skin", ex);
		}
	}

	public static ClientAsset.Texture skin() {
		return skin;
	}

	public static boolean slim() {
		return slim;
	}

	public static ClientAsset.Texture cape() {
		return cape;
	}

	public static boolean capeOnElytra() {
		return capeOnElytra;
	}

	private record Tex(Identifier id) implements ClientAsset.Texture {
		@Override
		public Identifier texturePath() {
			return id;
		}
	}
}
