package mc.glched.kilntally;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import net.fabricmc.loader.api.FabricLoader;

public final class KilnTallyConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

	public int lookDurability = 1;
	public int takeDurability = 1;
	public int cooldownTicks = 8;

	public static KilnTallyConfig load() {
		Path path = FabricLoader.getInstance().getConfigDir().resolve("kiln-tally.json");
		KilnTallyConfig config = new KilnTallyConfig();
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				KilnTallyConfig parsed = GSON.fromJson(reader, KilnTallyConfig.class);
				if (parsed != null) {
					config = parsed;
				}
			} catch (IOException | RuntimeException exception) {
				KilnTally.LOGGER.warn("Could not read kiln-tally.json, using defaults", exception);
			}
		}
		config.lookDurability = Math.max(0, config.lookDurability);
		config.takeDurability = Math.max(0, config.takeDurability);
		config.cooldownTicks = Math.max(0, Math.min(40, config.cooldownTicks));
		try {
			Files.createDirectories(path.getParent());
			Files.writeString(path, GSON.toJson(config));
		} catch (IOException exception) {
			KilnTally.LOGGER.warn("Could not write kiln-tally.json", exception);
		}
		return config;
	}
}
