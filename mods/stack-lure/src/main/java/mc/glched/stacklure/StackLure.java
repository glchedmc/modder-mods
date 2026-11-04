package mc.glched.stacklure;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.CreativeModeTab;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class StackLure implements ModInitializer {
	public static final String MOD_ID = "stack-lure";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);
	public static StackLureConfig CONFIG = new StackLureConfig();

	@Override
	public void onInitialize() {
		CONFIG = StackLureConfig.load();
		StackLureItems.initialize();
		ResourceKey<CreativeModeTab> tools = ResourceKey.create(Registries.CREATIVE_MODE_TAB, Identifier.withDefaultNamespace("tools_and_utilities"));
		CreativeModeTabEvents.modifyOutputEvent(tools).register(output -> output.accept(StackLureItems.STACK_LURE));
		ServerTickEvents.END_SERVER_TICK.register(StackDrawer::tick);
		LOGGER.info("[stack-lure] ready");
	}

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}
}
