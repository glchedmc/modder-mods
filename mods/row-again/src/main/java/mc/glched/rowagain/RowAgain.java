package mc.glched.rowagain;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.event.player.PlayerBlockBreakEvents;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class RowAgain implements ModInitializer {
	public static final String MOD_ID = "row-again";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);
	public static RowAgainConfig CONFIG = new RowAgainConfig();

	@Override
	public void onInitialize() {
		CONFIG = RowAgainConfig.load();
		PlayerBlockBreakEvents.AFTER.register(ReplantQueue::onBreak);
		ServerTickEvents.END_SERVER_TICK.register(ReplantQueue::tick);
		LOGGER.info("[row-again] ready");
	}
}
