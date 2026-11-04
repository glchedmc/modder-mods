package mc.glched.restockchime;

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

public final class RestockChime implements ModInitializer {
	public static final String MOD_ID = "restock-chime";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);
	public static RestockChimeConfig CONFIG = new RestockChimeConfig();

	@Override
	public void onInitialize() {
		CONFIG = RestockChimeConfig.load();
		RestockChimeItems.initialize();
		ResourceKey<CreativeModeTab> tools = ResourceKey.create(Registries.CREATIVE_MODE_TAB, Identifier.withDefaultNamespace("tools_and_utilities"));
		CreativeModeTabEvents.modifyOutputEvent(tools).register(output -> output.accept(RestockChimeItems.RESTOCK_CHIME));
		ServerTickEvents.END_SERVER_TICK.register(RestockWatches::tick);
		ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> RestockWatches.clear(handler.player.getUUID()));
		LOGGER.info("[restock-chime] ready");
	}

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}
}
