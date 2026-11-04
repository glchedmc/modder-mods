package mc.glched.stacklure;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import net.fabricmc.loader.api.FabricLoader;

public final class StackLureConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

	public double radius = 5.5;
	public double speed = 0.32;
	public int intervalTicks = 4;
	public int maxPerPass = 8;
	public boolean pullFullStacks = false;

	public static StackLureConfig load() {
		Path path = FabricLoader.getInstance().getConfigDir().resolve("stack-lure.json");
		StackLureConfig config = new StackLureConfig();
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				StackLureConfig parsed = GSON.fromJson(reader, StackLureConfig.class);
				if (parsed != null) {
					config = parsed;
				}
			} catch (IOException | RuntimeException exception) {
				StackLure.LOGGER.warn("Could not read stack-lure.json, using defaults", exception);
			}
		}
		config.radius = Math.max(2.0, Math.min(12.0, config.radius));
		config.speed = Math.max(0.05, Math.min(0.8, config.speed));
		config.intervalTicks = Math.max(1, Math.min(20, config.intervalTicks));
		config.maxPerPass = Math.max(1, Math.min(32, config.maxPerPass));
		try {
			Files.createDirectories(path.getParent());
			Files.writeString(path, GSON.toJson(config));
		} catch (IOException exception) {
			StackLure.LOGGER.warn("Could not write stack-lure.json", exception);
		}
		return config;
	}
}
