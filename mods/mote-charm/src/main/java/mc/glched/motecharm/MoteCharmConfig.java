package mc.glched.motecharm;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import net.fabricmc.loader.api.FabricLoader;

public final class MoteCharmConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

	public double scale = 0.4;
	public int durationTicks = 200;
	public int cooldownTicks = 80;
	public int durability = 2;

	public static MoteCharmConfig load() {
		Path path = FabricLoader.getInstance().getConfigDir().resolve("mote-charm.json");
		MoteCharmConfig config = new MoteCharmConfig();
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				MoteCharmConfig parsed = GSON.fromJson(reader, MoteCharmConfig.class);
				if (parsed != null) {
					config = parsed;
				}
			} catch (IOException | RuntimeException exception) {
				MoteCharm.LOGGER.warn("Could not read mote-charm.json, using defaults", exception);
			}
		}
		config.scale = Math.max(0.3, Math.min(0.7, config.scale));
		config.durationTicks = Math.max(40, Math.min(600, config.durationTicks));
		config.cooldownTicks = Math.max(10, config.cooldownTicks);
		config.durability = Math.max(1, config.durability);
		try {
			Files.createDirectories(path.getParent());
			Files.writeString(path, GSON.toJson(config));
		} catch (IOException exception) {
			MoteCharm.LOGGER.warn("Could not write mote-charm.json", exception);
		}
		return config;
	}
}
