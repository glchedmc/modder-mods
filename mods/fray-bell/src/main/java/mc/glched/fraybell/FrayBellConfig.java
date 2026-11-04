package mc.glched.fraybell;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import net.fabricmc.loader.api.FabricLoader;

public final class FrayBellConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

	public double[] thresholds = new double[] {0.25, 0.10, 0.05};
	public boolean checkArmor = true;
	public boolean checkHotbar = true;
	public boolean checkHand = true;

	public static FrayBellConfig load() {
		Path path = FabricLoader.getInstance().getConfigDir().resolve("fray-bell.json");
		FrayBellConfig config = new FrayBellConfig();
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				FrayBellConfig parsed = GSON.fromJson(reader, FrayBellConfig.class);
				if (parsed != null) {
					config = parsed;
				}
			} catch (IOException | RuntimeException exception) {
				FrayBell.LOGGER.warn("Could not read fray-bell.json, using defaults", exception);
			}
		}
		if (config.thresholds == null || config.thresholds.length == 0) {
			config.thresholds = new double[] {0.25, 0.10, 0.05};
		}
		config.thresholds = Arrays.stream(config.thresholds).filter(value -> value > 0.0 && value < 1.0).sorted().toArray();
		try {
			Files.createDirectories(path.getParent());
			Files.writeString(path, GSON.toJson(config));
		} catch (IOException exception) {
			FrayBell.LOGGER.warn("Could not write fray-bell.json", exception);
		}
		return config;
	}
}
