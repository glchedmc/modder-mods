package mc.glched.salvagehook;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import net.fabricmc.loader.api.FabricLoader;

public final class SalvageHookConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

	public double range = 24.0;
	public int cooldownTicks = 15;
	public int durabilityCost = 1;
	public double maxSpeed = 1.7;

	public static SalvageHookConfig load() {
		Path path = FabricLoader.getInstance().getConfigDir().resolve("salvage-hook.json");
		SalvageHookConfig config = new SalvageHookConfig();
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				SalvageHookConfig parsed = GSON.fromJson(reader, SalvageHookConfig.class);
				if (parsed != null) {
					config = parsed;
				}
			} catch (IOException | RuntimeException exception) {
				SalvageHook.LOGGER.warn("Could not read salvage-hook.json, using defaults", exception);
			}
		}
		config.range = Math.max(4.0, Math.min(48.0, config.range));
		config.cooldownTicks = Math.max(5, config.cooldownTicks);
		config.durabilityCost = Math.max(1, config.durabilityCost);
		config.maxSpeed = Math.max(0.4, Math.min(3.0, config.maxSpeed));
		try {
			Files.createDirectories(path.getParent());
			Files.writeString(path, GSON.toJson(config));
		} catch (IOException exception) {
			SalvageHook.LOGGER.warn("Could not write salvage-hook.json", exception);
		}
		return config;
	}
}
