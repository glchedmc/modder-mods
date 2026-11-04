package mc.glched.smoke;

import net.fabricmc.api.ModInitializer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class SmokeHarness implements ModInitializer {
	public static final Logger LOGGER = LoggerFactory.getLogger("modder-smoke");

	@Override
	public void onInitialize() {
		LOGGER.info("[modder-smoke] harness ready");
	}
}
