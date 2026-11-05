package mc.glched.seampick;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import net.fabricmc.loader.api.FabricLoader;

public final class SeamPickConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

	public int maxExtraBlocks = 24;
	public int extraDurability = 2;
	public float exhaustion = 0.4F;
	public int minFood = 6;
	public int maxDistance = 16;

	public static SeamPickConfig load() {
		Path path = FabricLoader.getInstance().getConfigDir().resolve("seam-pick.json");
		SeamPickConfig config = new SeamPickConfig();
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				SeamPickConfig parsed = GSON.fromJson(reader, SeamPickConfig.class);
				if (parsed != null) {
					config = parsed;
				}
			} catch (IOException | RuntimeException exception) {
				SeamPick.LOGGER.warn("Could not read seam-pick.json, using defaults", exception);
			}
		}
		config.maxExtraBlocks = Math.max(1, Math.min(64, config.maxExtraBlocks));
		config.extraDurability = Math.max(1, config.extraDurability);
		config.exhaustion = Math.max(0.0F, config.exhaustion);
		config.minFood = Math.max(0, Math.min(20, config.minFood));
		config.maxDistance = Math.max(2, Math.min(32, config.maxDistance));
		try {
			Files.createDirectories(path.getParent());
			Files.writeString(path, GSON.toJson(config));
		} catch (IOException exception) {
			SeamPick.LOGGER.warn("Could not write seam-pick.json", exception);
		}
		return config;
	}
}
