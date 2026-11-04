package mc.glched.lastlight;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import net.fabricmc.loader.api.FabricLoader;

public final class LastLightConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

	public int guideSeconds = 300;
	public int arrivalBlocks = 8;
	public boolean guideOnRespawn = true;

	public static LastLightConfig load() {
		Path path = FabricLoader.getInstance().getConfigDir().resolve("last-light.json");
		LastLightConfig config = new LastLightConfig();
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				LastLightConfig parsed = GSON.fromJson(reader, LastLightConfig.class);
				if (parsed != null) {
					config = parsed;
				}
			} catch (IOException | RuntimeException exception) {
				LastLight.LOGGER.warn("Could not read last-light.json, using defaults", exception);
			}
		}
		config.guideSeconds = Math.max(10, config.guideSeconds);
		config.arrivalBlocks = Math.max(1, config.arrivalBlocks);
		try {
			Files.createDirectories(path.getParent());
			Files.writeString(path, GSON.toJson(config));
		} catch (IOException exception) {
			LastLight.LOGGER.warn("Could not write last-light.json", exception);
		}
		return config;
	}
}
