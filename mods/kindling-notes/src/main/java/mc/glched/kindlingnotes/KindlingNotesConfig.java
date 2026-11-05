package mc.glched.kindlingnotes;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import net.fabricmc.loader.api.FabricLoader;

public final class KindlingNotesConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

	public boolean showFood = true;
	public boolean showFuel = true;
	public boolean showCompost = true;
	public boolean showRepair = true;
	public boolean showDurability = true;

	public static KindlingNotesConfig load() {
		Path path = FabricLoader.getInstance().getConfigDir().resolve("kindling-notes.json");
		KindlingNotesConfig config = new KindlingNotesConfig();
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				KindlingNotesConfig parsed = GSON.fromJson(reader, KindlingNotesConfig.class);
				if (parsed != null) {
					config = parsed;
				}
			} catch (IOException | RuntimeException exception) {
				KindlingNotesClient.LOGGER.warn("Could not read kindling-notes.json, using defaults", exception);
			}
		}
		try {
			Files.createDirectories(path.getParent());
			Files.writeString(path, GSON.toJson(config));
		} catch (IOException exception) {
			KindlingNotesClient.LOGGER.warn("Could not write kindling-notes.json", exception);
		}
		return config;
	}
}
