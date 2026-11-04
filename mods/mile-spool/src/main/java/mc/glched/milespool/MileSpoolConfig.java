package mc.glched.milespool;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import net.fabricmc.loader.api.FabricLoader;

public final class MileSpoolConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

	public int guideIntervalTicks = 20;
	public int markDurability = 1;

	public static MileSpoolConfig load() {
		Path path = FabricLoader.getInstance().getConfigDir().resolve("mile-spool.json");
		MileSpoolConfig config = new MileSpoolConfig();
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				MileSpoolConfig parsed = GSON.fromJson(reader, MileSpoolConfig.class);
				if (parsed != null) {
					config = parsed;
				}
			} catch (IOException | RuntimeException exception) {
				MileSpool.LOGGER.warn("Could not read mile-spool.json, using defaults", exception);
			}
		}
		config.guideIntervalTicks = Math.max(5, Math.min(100, config.guideIntervalTicks));
		config.markDurability = Math.max(0, Math.min(10, config.markDurability));
		try {
			Files.createDirectories(path.getParent());
			Files.writeString(path, GSON.toJson(config));
		} catch (IOException exception) {
			MileSpool.LOGGER.warn("Could not write mile-spool.json", exception);
		}
		return config;
	}
}
