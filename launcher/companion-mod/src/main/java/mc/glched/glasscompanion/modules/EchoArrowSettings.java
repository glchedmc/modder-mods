package mc.glched.glasscompanion.modules;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;

import net.fabricmc.loader.api.FabricLoader;

public final class EchoArrowSettings {
	public static final long DEFAULT_FADE_MS = 2500L;
	public static final int DEFAULT_MAX_ARROWS = 8;
	public static final double DEFAULT_MERGE_DISTANCE = 4.0;
	public static final int DEFAULT_RING_RADIUS = 40;
	public static final float DEFAULT_PITCH_THRESHOLD = 30.0f;

	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final Path PATH = FabricLoader.getInstance().getConfigDir().resolve("glass-companion-echo-arrow.json");

	public static boolean enabled = true;
	public static Filter filter = Filter.ALL;
	public static long fadeMs = DEFAULT_FADE_MS;
	public static int maxArrows = DEFAULT_MAX_ARROWS;
	public static double mergeDistance = DEFAULT_MERGE_DISTANCE;
	public static int ringRadius = DEFAULT_RING_RADIUS;

	private EchoArrowSettings() {
	}

	public static void load() {
		if (!Files.isRegularFile(PATH)) {
			save();
			return;
		}
		try (Reader reader = Files.newBufferedReader(PATH, StandardCharsets.UTF_8)) {
			JsonObject json = GSON.fromJson(reader, JsonObject.class);
			if (json == null) {
				return;
			}
			if (json.has("enabled")) {
				enabled = json.get("enabled").getAsBoolean();
			}
			if (json.has("filter")) {
				filter = Filter.fromName(json.get("filter").getAsString());
			}
			if (json.has("fadeMs")) {
				fadeMs = Math.max(500L, Math.min(10_000L, json.get("fadeMs").getAsLong()));
			}
			if (json.has("maxArrows")) {
				maxArrows = Math.max(1, Math.min(16, json.get("maxArrows").getAsInt()));
			}
			if (json.has("mergeDistance")) {
				mergeDistance = Math.max(0.5, Math.min(16.0, json.get("mergeDistance").getAsDouble()));
			}
			if (json.has("ringRadius")) {
				ringRadius = Math.max(16, Math.min(80, json.get("ringRadius").getAsInt()));
			}
		} catch (Exception e) {
			mc.glched.glasscompanion.GlassCompanion.LOGGER.warn("Could not read {}; using defaults.", PATH, e);
		}
	}

	public static void save() {
		JsonObject json = new JsonObject();
		json.addProperty("enabled", enabled);
		json.addProperty("filter", filter.name().toLowerCase(Locale.ROOT));
		json.addProperty("fadeMs", fadeMs);
		json.addProperty("maxArrows", maxArrows);
		json.addProperty("mergeDistance", mergeDistance);
		json.addProperty("ringRadius", ringRadius);
		try {
			Files.createDirectories(PATH.getParent());
			try (Writer writer = Files.newBufferedWriter(PATH, StandardCharsets.UTF_8)) {
				GSON.toJson(json, writer);
			}
		} catch (IOException e) {
			mc.glched.glasscompanion.GlassCompanion.LOGGER.warn("Could not write {}.", PATH, e);
		}
	}

	public enum Filter {
		ALL("echo-arrow.filter.all"),
		HOSTILE("echo-arrow.filter.hostile"),
		NOTES("echo-arrow.filter.notes"),
		NOTES_AND_HOSTILE("echo-arrow.filter.notes_and_hostile");

		public final String translationKey;

		Filter(String translationKey) {
			this.translationKey = translationKey;
		}

		public Filter next() {
			return values()[(ordinal() + 1) % values().length];
		}

		static Filter fromName(String name) {
			if (name == null || name.isBlank()) {
				return ALL;
			}
			try {
				return Filter.valueOf(name.trim().toUpperCase(Locale.ROOT));
			} catch (IllegalArgumentException ignored) {
				return ALL;
			}
		}
	}
}
