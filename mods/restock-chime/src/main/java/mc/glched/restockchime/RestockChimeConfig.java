package mc.glched.restockchime;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import net.fabricmc.loader.api.FabricLoader;

public final class RestockChimeConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

	public int range = 32;
	public int maxWatched = 8;
	public int intervalTicks = 40;

	public static RestockChimeConfig load() {
		Path path = FabricLoader.getInstance().getConfigDir().resolve("restock-chime.json");
		RestockChimeConfig config = new RestockChimeConfig();
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				RestockChimeConfig parsed = GSON.fromJson(reader, RestockChimeConfig.class);
				if (parsed != null) {
					config = parsed;
				}
			} catch (IOException | RuntimeException exception) {
				RestockChime.LOGGER.warn("Could not read restock-chime.json, using defaults", exception);
			}
		}
		config.range = Math.max(8, Math.min(64, config.range));
		config.maxWatched = Math.max(1, Math.min(24, config.maxWatched));
		config.intervalTicks = Math.max(10, Math.min(200, config.intervalTicks));
		try {
			Files.createDirectories(path.getParent());
			Files.writeString(path, GSON.toJson(config));
		} catch (IOException exception) {
			RestockChime.LOGGER.warn("Could not write restock-chime.json", exception);
		}
		return config;
	}
}
