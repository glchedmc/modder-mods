package mc.glched.tidewand;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import net.fabricmc.loader.api.FabricLoader;

public final class TideWandConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

	public double launchSpeed = 1.15;
	public double launchLift = 0.32;
	public int launchCooldown = 25;
	public int launchDurability = 1;
	public int wellCooldown = 40;
	public int wellDurationTicks = 160;
	public double wellRadius = 6.0;
	public double wellPull = 0.18;
	public int wellDurability = 3;

	public static TideWandConfig load() {
		Path path = FabricLoader.getInstance().getConfigDir().resolve("tide-wand.json");
		TideWandConfig config = new TideWandConfig();
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				TideWandConfig parsed = GSON.fromJson(reader, TideWandConfig.class);
				if (parsed != null) {
					config = parsed;
				}
			} catch (IOException | RuntimeException exception) {
				TideWand.LOGGER.warn("Could not read tide-wand.json, using defaults", exception);
			}
		}
		config.launchSpeed = Math.max(0.2, Math.min(2.5, config.launchSpeed));
		config.launchLift = Math.max(0.0, Math.min(1.0, config.launchLift));
		config.launchCooldown = Math.max(5, config.launchCooldown);
		config.launchDurability = Math.max(1, config.launchDurability);
		config.wellCooldown = Math.max(5, config.wellCooldown);
		config.wellDurationTicks = Math.max(20, Math.min(400, config.wellDurationTicks));
		config.wellRadius = Math.max(2.0, Math.min(10.0, config.wellRadius));
		config.wellPull = Math.max(0.02, Math.min(0.6, config.wellPull));
		config.wellDurability = Math.max(1, config.wellDurability);
		try {
			Files.createDirectories(path.getParent());
			Files.writeString(path, GSON.toJson(config));
		} catch (IOException exception) {
			TideWand.LOGGER.warn("Could not write tide-wand.json", exception);
		}
		return config;
	}
}
