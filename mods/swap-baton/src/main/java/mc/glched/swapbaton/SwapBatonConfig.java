package mc.glched.swapbaton;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import net.fabricmc.loader.api.FabricLoader;

public final class SwapBatonConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

	public double reach = 6.0;
	public int durability = 1;
	public int cooldownTicks = 6;

	public static SwapBatonConfig load() {
		Path path = FabricLoader.getInstance().getConfigDir().resolve("swap-baton.json");
		SwapBatonConfig config = new SwapBatonConfig();
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				SwapBatonConfig parsed = GSON.fromJson(reader, SwapBatonConfig.class);
				if (parsed != null) {
					config = parsed;
				}
			} catch (IOException | RuntimeException exception) {
				SwapBaton.LOGGER.warn("Could not read swap-baton.json, using defaults", exception);
			}
		}
		config.reach = Math.max(3.0, Math.min(8.0, config.reach));
		config.durability = Math.max(0, config.durability);
		config.cooldownTicks = Math.max(0, Math.min(40, config.cooldownTicks));
		try {
			Files.createDirectories(path.getParent());
			Files.writeString(path, GSON.toJson(config));
		} catch (IOException exception) {
			SwapBaton.LOGGER.warn("Could not write swap-baton.json", exception);
		}
		return config;
	}
}
