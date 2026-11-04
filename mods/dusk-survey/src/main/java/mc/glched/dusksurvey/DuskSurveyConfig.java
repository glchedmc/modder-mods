package mc.glched.dusksurvey;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import net.fabricmc.loader.api.FabricLoader;

public final class DuskSurveyConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

	public int radius = 8;
	public int vertical = 3;
	public int maxBlockLight = 0;
	public int cooldownTicks = 30;
	public boolean showParticles = true;
	public int durability = 1;

	public static DuskSurveyConfig load() {
		Path path = FabricLoader.getInstance().getConfigDir().resolve("dusk-survey.json");
		DuskSurveyConfig config = new DuskSurveyConfig();
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				DuskSurveyConfig parsed = GSON.fromJson(reader, DuskSurveyConfig.class);
				if (parsed != null) {
					config = parsed;
				}
			} catch (IOException | RuntimeException exception) {
				DuskSurvey.LOGGER.warn("Could not read dusk-survey.json, using defaults", exception);
			}
		}
		config.radius = Math.max(3, Math.min(12, config.radius));
		config.vertical = Math.max(1, Math.min(6, config.vertical));
		config.maxBlockLight = Math.max(0, Math.min(7, config.maxBlockLight));
		config.cooldownTicks = Math.max(5, Math.min(100, config.cooldownTicks));
		config.durability = Math.max(0, config.durability);
		try {
			Files.createDirectories(path.getParent());
			Files.writeString(path, GSON.toJson(config));
		} catch (IOException exception) {
			DuskSurvey.LOGGER.warn("Could not write dusk-survey.json", exception);
		}
		return config;
	}
}
