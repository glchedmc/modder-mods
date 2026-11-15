package mc.glched.glasscompanion.waypoints;

import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import mc.glched.glasscompanion.CompanionConfig;
import mc.glched.glasscompanion.GlassCompanion;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.storage.LevelResource;

/**
 * Lunar-style waypoints, saved per world (singleplayer save folder) or server
 * address in config/glass-companion-waypoints.json. Each waypoint belongs to
 * one dimension and only shows there.
 */
public final class Waypoints {
	/** Swatches offered in the editor; the first eight cycle when you click a color dot. */
	public static final int[] COLORS = {0xFF7AA8FF, 0xFF5BE49B, 0xFFFFD36B, 0xFFFF8FB1, 0xFFB28DFF, 0xFF6BE4FF, 0xFFFFB36B, 0xFFFFFFFF, 0xFFFF5555};
	public static final int DEATH_COLOR = 0xFFFF5555;
	private static final int MAX_DEATHS = 5;
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("h:mm a", Locale.ROOT);

	public static final class Waypoint {
		public String name;
		public int x, y, z;
		public int color;
		public boolean enabled = true;
		public String dimension;
		public boolean death;

		public Waypoint(String name, int x, int y, int z, int color, String dimension) {
			this.name = name;
			this.x = x;
			this.y = y;
			this.z = z;
			this.color = color;
			this.dimension = dimension;
		}

		public BlockPos pos() {
			return new BlockPos(x, y, z);
		}
	}

	private static final List<Waypoint> LIST = new ArrayList<>();
	private static String loadedKey;

	private Waypoints() {
	}

	public static Path file() {
		return FabricLoader.getInstance().getConfigDir().resolve("glass-companion-waypoints.json");
	}

	/** "sp:<save folder>" in singleplayer, "mp:<address>" on a server, null outside a world. */
	public static String worldKey(Minecraft mc) {
		if (mc.level == null) {
			return null;
		}
		if (mc.getSingleplayerServer() != null) {
			Path root = mc.getSingleplayerServer().getWorldPath(LevelResource.ROOT).toAbsolutePath().normalize();
			return "sp:" + root.getFileName();
		}
		ServerData server = mc.getCurrentServer();
		return server != null ? "mp:" + server.ip.toLowerCase(Locale.ROOT) : "mp:unknown";
	}

	public static String dimension(Minecraft mc) {
		return mc.level == null ? "" : mc.level.dimension().identifier().toString();
	}

	public static String prettyDimension(String dim) {
		String path = dim.contains(":") ? dim.substring(dim.indexOf(':') + 1) : dim;
		return switch (path) {
			case "overworld" -> "Overworld";
			case "the_nether" -> "Nether";
			case "the_end" -> "End";
			default -> path.replace('_', ' ');
		};
	}

	/** Waypoints of the world you are in (loaded on first use after joining). */
	public static List<Waypoint> all(Minecraft mc) {
		String key = worldKey(mc);
		if (key == null) {
			LIST.clear();
			loadedKey = null;
			return LIST;
		}
		if (!key.equals(loadedKey)) {
			load(key);
		}
		return LIST;
	}

	public static List<Waypoint> visibleHere(Minecraft mc) {
		String dim = dimension(mc);
		List<Waypoint> out = new ArrayList<>();
		for (Waypoint w : all(mc)) {
			if (w.enabled && w.dimension.equals(dim)) {
				out.add(w);
			}
		}
		return out;
	}

	public static boolean active() {
		return CompanionConfig.module("waypoints");
	}

	public static String nextName(Minecraft mc) {
		int n = 1;
		for (Waypoint w : all(mc)) {
			if (!w.death) {
				n++;
			}
		}
		return "Waypoint " + n;
	}

	public static int nextColor(Minecraft mc) {
		int n = 0;
		for (Waypoint w : all(mc)) {
			if (!w.death) {
				n++;
			}
		}
		return COLORS[n % 8];
	}

	public static Waypoint add(Minecraft mc, Waypoint w) {
		all(mc).add(w);
		save();
		return w;
	}

	public static void remove(Minecraft mc, Waypoint w) {
		all(mc).remove(w);
		save();
	}

	/** Called by the death point module: keeps the newest few death waypoints. */
	public static void addDeath(Minecraft mc, BlockPos pos, String dim) {
		if (!active() || !CompanionConfig.bool("waypointDeath")) {
			return;
		}
		List<Waypoint> list = all(mc);
		if (worldKey(mc) == null) {
			return;
		}
		Waypoint w = new Waypoint("Death " + LocalTime.now().format(TIME), pos.getX(), pos.getY(), pos.getZ(), DEATH_COLOR, dim);
		w.death = true;
		list.add(w);
		int deaths = 0;
		for (int i = list.size() - 1; i >= 0; i--) {
			if (list.get(i).death && ++deaths > MAX_DEATHS) {
				list.remove(i);
			}
		}
		save();
	}

	private static void load(String key) {
		LIST.clear();
		loadedKey = key;
		Path path = file();
		if (!Files.exists(path)) {
			return;
		}
		try (Reader r = Files.newBufferedReader(path)) {
			JsonObject root = JsonParser.parseReader(r).getAsJsonObject();
			if (!root.has(key)) {
				return;
			}
			for (JsonElement e : root.getAsJsonArray(key)) {
				JsonObject o = e.getAsJsonObject();
				Waypoint w = new Waypoint(o.get("name").getAsString(), o.get("x").getAsInt(), o.get("y").getAsInt(), o.get("z").getAsInt(),
						parseColor(o.has("color") ? o.get("color").getAsString() : "#7AA8FF"),
						o.has("dimension") ? o.get("dimension").getAsString() : "minecraft:overworld");
				w.enabled = !o.has("enabled") || o.get("enabled").getAsBoolean();
				w.death = o.has("death") && o.get("death").getAsBoolean();
				LIST.add(w);
			}
		} catch (Exception ex) {
			GlassCompanion.LOGGER.warn("[glass-companion] could not read waypoints", ex);
		}
	}

	public static void save() {
		if (loadedKey == null) {
			return;
		}
		Path path = file();
		JsonObject root = new JsonObject();
		try {
			if (Files.exists(path)) {
				try (Reader r = Files.newBufferedReader(path)) {
					root = JsonParser.parseReader(r).getAsJsonObject();
				}
			}
		} catch (Exception ex) {
			root = new JsonObject();
		}
		JsonArray arr = new JsonArray();
		for (Waypoint w : LIST) {
			JsonObject o = new JsonObject();
			o.addProperty("name", w.name);
			o.addProperty("x", w.x);
			o.addProperty("y", w.y);
			o.addProperty("z", w.z);
			o.addProperty("color", String.format(Locale.ROOT, "#%06X", w.color & 0xFFFFFF));
			o.addProperty("enabled", w.enabled);
			o.addProperty("dimension", w.dimension);
			if (w.death) {
				o.addProperty("death", true);
			}
			arr.add(o);
		}
		if (arr.isEmpty()) {
			root.remove(loadedKey);
		} else {
			root.add(loadedKey, arr);
		}
		try {
			Files.createDirectories(path.getParent());
			try (Writer w = Files.newBufferedWriter(path)) {
				GSON.toJson(root, w);
			}
		} catch (Exception ex) {
			GlassCompanion.LOGGER.warn("[glass-companion] could not save waypoints", ex);
		}
	}

	public static int parseColor(String hex) {
		try {
			return 0xFF000000 | Integer.parseInt(hex.replace("#", ""), 16);
		} catch (Exception ex) {
			return COLORS[0];
		}
	}
}
