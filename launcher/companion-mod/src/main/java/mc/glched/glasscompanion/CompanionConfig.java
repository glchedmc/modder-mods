package mc.glched.glasscompanion;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import net.fabricmc.loader.api.FabricLoader;

/**
 * Settings shared with Saturn Client through config/glass-companion.json. The
 * feature catalog (labels, groups, ranges) is bundled from the launcher so the
 * in-game menu and the launcher's settings page always list the same toggles.
 */
public final class CompanionConfig {
	public record Feature(String key, String group, String label, String type, double min, double max, double step, JsonElement def, String hint) {
	}

	public record Group(String id, String label) {
	}

	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final List<Feature> FEATURES = new ArrayList<>();
	private static final List<Group> GROUPS = new ArrayList<>();
	private static final Map<String, JsonElement> VALUES = new LinkedHashMap<>();
	private static long lastModified = -1;

	private CompanionConfig() {
	}

	public static Path file() {
		return FabricLoader.getInstance().getConfigDir().resolve("glass-companion.json");
	}

	public static List<Feature> features() {
		return FEATURES;
	}

	public static List<Group> groups() {
		return GROUPS;
	}

	static void loadCatalog() {
		try (InputStream in = CompanionConfig.class.getResourceAsStream("/assets/glass-companion/features.json")) {
			if (in == null) {
				throw new IllegalStateException("features.json missing from jar");
			}
			JsonObject root = JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject();
			for (JsonElement g : root.getAsJsonArray("groups")) {
				JsonObject o = g.getAsJsonObject();
				GROUPS.add(new Group(o.get("id").getAsString(), o.get("label").getAsString()));
			}
			JsonArray arr = root.getAsJsonArray("features");
			for (JsonElement e : arr) {
				JsonObject o = e.getAsJsonObject();
				FEATURES.add(new Feature(
						o.get("key").getAsString(),
						o.get("group").getAsString(),
						o.get("label").getAsString(),
						o.get("type").getAsString(),
						o.has("min") ? o.get("min").getAsDouble() : 0,
						o.has("max") ? o.get("max").getAsDouble() : 1,
						o.has("step") ? o.get("step").getAsDouble() : 1,
						o.get("default"),
						o.has("hint") ? o.get("hint").getAsString() : ""));
			}
		} catch (IOException ex) {
			throw new IllegalStateException(ex);
		}
		for (Feature f : FEATURES) {
			VALUES.put(f.key(), f.def());
		}
	}

	public static void load() {
		Path path = file();
		if (!Files.exists(path)) {
			save();
			return;
		}
		try (Reader r = Files.newBufferedReader(path)) {
			JsonObject o = JsonParser.parseReader(r).getAsJsonObject();
			for (Feature f : FEATURES) {
				if (o.has(f.key())) {
					VALUES.put(f.key(), o.get(f.key()));
				}
			}
			lastModified = Files.getLastModifiedTime(path).toMillis();
		} catch (Exception ex) {
			GlassCompanion.LOGGER.warn("[glass-companion] could not read config, using defaults", ex);
		}
	}

	/** Picks up edits the launcher made while the game was running. */
	static void reloadIfChanged() {
		try {
			Path path = file();
			if (Files.exists(path) && Files.getLastModifiedTime(path).toMillis() != lastModified) {
				load();
			}
		} catch (IOException ignored) {
		}
	}

	public static void save() {
		JsonObject o = new JsonObject();
		VALUES.forEach(o::add);
		try {
			Files.createDirectories(file().getParent());
			try (Writer w = Files.newBufferedWriter(file())) {
				GSON.toJson(o, w);
			}
			lastModified = Files.getLastModifiedTime(file()).toMillis();
		} catch (IOException ex) {
			GlassCompanion.LOGGER.warn("[glass-companion] could not save config", ex);
		}
	}

	public static boolean bool(String key) {
		JsonElement e = VALUES.get(key);
		return e != null && e.isJsonPrimitive() && e.getAsBoolean();
	}

	public static double num(String key) {
		JsonElement e = VALUES.get(key);
		return e != null && e.isJsonPrimitive() ? e.getAsDouble() : 0;
	}

	/** ARGB color from "#RRGGBB". */
	public static int color(String key) {
		JsonElement e = VALUES.get(key);
		try {
			return 0xFF000000 | Integer.parseInt(e.getAsString().substring(1), 16);
		} catch (Exception ex) {
			return 0xFFFFFFFF;
		}
	}

	public static String string(String key) {
		JsonElement e = VALUES.get(key);
		return e == null ? "" : e.getAsString();
	}

	public static void set(String key, boolean v) {
		VALUES.put(key, GSON.toJsonTree(v));
	}

	public static void set(String key, double v) {
		VALUES.put(key, GSON.toJsonTree(v));
	}

	public static void set(String key, String v) {
		VALUES.put(key, GSON.toJsonTree(v));
	}
}
