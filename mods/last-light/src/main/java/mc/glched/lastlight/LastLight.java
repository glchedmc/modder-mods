package mc.glched.lastlight;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.entity.event.v1.ServerPlayerEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class LastLight implements ModInitializer {
	public static final String MOD_ID = "last-light";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);
	public static LastLightConfig CONFIG = new LastLightConfig();

	@Override
	public void onInitialize() {
		CONFIG = LastLightConfig.load();
		ServerPlayerEvents.AFTER_RESPAWN.register((oldPlayer, newPlayer, alive) -> {
			if (!alive && LastLight.CONFIG.guideOnRespawn) {
				LightGuide.start(newPlayer);
			}
		});
		ServerTickEvents.END_SERVER_TICK.register(LightGuide::tick);
		ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> LightGuide.stop(handler.player.getUUID()));
		CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> LightCommands.register(dispatcher));
		LOGGER.info("[last-light] ready");
	}
}
