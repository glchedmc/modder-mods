package mc.glched.rowagain;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import net.fabricmc.loader.api.FabricLoader;

public final class RowAgainConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

	public boolean enabled = true;
	public boolean sneakSkips = true;

	public static RowAgainConfig load() {
		Path path = FabricLoader.getInstance().getConfigDir().resolve("row-again.json");
		RowAgainConfig config = new RowAgainConfig();
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				RowAgainConfig parsed = GSON.fromJson(reader, RowAgainConfig.class);
				if (parsed != null) {
					config = parsed;
				}
			} catch (IOException | RuntimeException exception) {
				RowAgain.LOGGER.warn("Could not read row-again.json, using defaults", exception);
			}
		}
		try {
			Files.createDirectories(path.getParent());
			Files.writeString(path, GSON.toJson(config));
		} catch (IOException exception) {
			RowAgain.LOGGER.warn("Could not write row-again.json", exception);
		}
		return config;
	}
}
