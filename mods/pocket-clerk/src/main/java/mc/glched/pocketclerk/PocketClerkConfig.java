package mc.glched.pocketclerk;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import net.fabricmc.loader.api.FabricLoader;

public final class PocketClerkConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

	public boolean sortHotbar = false;
	public boolean quickStackHotbar = false;

	public static PocketClerkConfig load() {
		Path path = FabricLoader.getInstance().getConfigDir().resolve("pocket-clerk.json");
		PocketClerkConfig config = new PocketClerkConfig();
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				PocketClerkConfig parsed = GSON.fromJson(reader, PocketClerkConfig.class);
				if (parsed != null) {
					config = parsed;
				}
			} catch (IOException | RuntimeException exception) {
				PocketClerk.LOGGER.warn("Could not read pocket-clerk.json, using defaults", exception);
			}
		}
		try {
			Files.createDirectories(path.getParent());
			Files.writeString(path, GSON.toJson(config));
		} catch (IOException exception) {
			PocketClerk.LOGGER.warn("Could not write pocket-clerk.json", exception);
		}
		return config;
	}
}
