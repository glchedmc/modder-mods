package mc.glched.fraybell;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class FrayBell implements ModInitializer {
	public static final String MOD_ID = "fray-bell";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);
	public static FrayBellConfig CONFIG = new FrayBellConfig();

	@Override
	public void onInitialize() {
		CONFIG = FrayBellConfig.load();
		ServerTickEvents.END_SERVER_TICK.register(FrayWatcher::tick);
		ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> FrayWatcher.forget(handler.player));
		LOGGER.info("[fray-bell] ready");
	}
}
