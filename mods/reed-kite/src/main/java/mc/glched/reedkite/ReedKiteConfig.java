package mc.glched.reedkite;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import net.fabricmc.loader.api.FabricLoader;

public final class ReedKiteConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

	public double maxFallSpeed = 0.13;
	public double drift = 0.035;
	public double maxHorizontal = 0.45;
	public float exhaustionPerSecond = 0.12F;
	public int durabilityPerSecond = 1;

	public static ReedKiteConfig load() {
		Path path = FabricLoader.getInstance().getConfigDir().resolve("reed-kite.json");
		ReedKiteConfig config = new ReedKiteConfig();
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				ReedKiteConfig parsed = GSON.fromJson(reader, ReedKiteConfig.class);
				if (parsed != null) {
					config = parsed;
				}
			} catch (IOException | RuntimeException exception) {
				ReedKite.LOGGER.warn("Could not read reed-kite.json, using defaults", exception);
			}
		}
		config.maxFallSpeed = Math.max(0.05, Math.min(0.4, config.maxFallSpeed));
		config.drift = Math.max(0.0, Math.min(0.12, config.drift));
		config.maxHorizontal = Math.max(0.1, Math.min(1.0, config.maxHorizontal));
		config.exhaustionPerSecond = Math.max(0.0F, config.exhaustionPerSecond);
		config.durabilityPerSecond = Math.max(0, config.durabilityPerSecond);
		try {
			Files.createDirectories(path.getParent());
			Files.writeString(path, GSON.toJson(config));
		} catch (IOException exception) {
			ReedKite.LOGGER.warn("Could not write reed-kite.json", exception);
		}
		return config;
	}
}
