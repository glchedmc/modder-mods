package mc.glched.reedkite;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.CreativeModeTab;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class ReedKite implements ModInitializer {
	public static final String MOD_ID = "reed-kite";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);
	public static ReedKiteConfig CONFIG = new ReedKiteConfig();

	@Override
	public void onInitialize() {
		CONFIG = ReedKiteConfig.load();
		ReedKiteItems.initialize();
		ResourceKey<CreativeModeTab> tools = ResourceKey.create(Registries.CREATIVE_MODE_TAB, Identifier.withDefaultNamespace("tools_and_utilities"));
		CreativeModeTabEvents.modifyOutputEvent(tools).register(output -> output.accept(ReedKiteItems.REED_KITE));
		ServerTickEvents.END_SERVER_TICK.register(ReedGlide::tick);
		ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> ReedGlide.forget(handler.player.getUUID()));
		LOGGER.info("[reed-kite] ready");
	}

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}
}
