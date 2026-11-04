package mc.glched.kilntally;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.CreativeModeTab;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class KilnTally implements ModInitializer {
	public static final String MOD_ID = "kiln-tally";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);
	public static KilnTallyConfig CONFIG = new KilnTallyConfig();

	@Override
	public void onInitialize() {
		CONFIG = KilnTallyConfig.load();
		KilnTallyItems.initialize();
		ResourceKey<CreativeModeTab> tools = ResourceKey.create(Registries.CREATIVE_MODE_TAB, Identifier.withDefaultNamespace("tools_and_utilities"));
		CreativeModeTabEvents.modifyOutputEvent(tools).register(output -> output.accept(KilnTallyItems.KILN_TALLY));
		LOGGER.info("[kiln-tally] ready");
	}

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}
}
