package mc.glched.salvagehook;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.CreativeModeTab;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class SalvageHook implements ModInitializer {
	public static final String MOD_ID = "salvage-hook";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);
	public static SalvageHookConfig CONFIG = new SalvageHookConfig();

	@Override
	public void onInitialize() {
		CONFIG = SalvageHookConfig.load();
		SalvageHookItems.initialize();
		ResourceKey<CreativeModeTab> tools = ResourceKey.create(Registries.CREATIVE_MODE_TAB, Identifier.withDefaultNamespace("tools_and_utilities"));
		CreativeModeTabEvents.modifyOutputEvent(tools).register(output -> output.accept(SalvageHookItems.SALVAGE_HOOK));
		LOGGER.info("[salvage-hook] ready");
	}

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}
}
