package mc.glched.seampick;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents;
import net.fabricmc.fabric.api.event.player.PlayerBlockBreakEvents;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.CreativeModeTab;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class SeamPick implements ModInitializer {
	public static final String MOD_ID = "seam-pick";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);
	public static SeamPickConfig CONFIG = new SeamPickConfig();

	@Override
	public void onInitialize() {
		CONFIG = SeamPickConfig.load();
		SeamPickItems.initialize();
		ResourceKey<CreativeModeTab> tools = ResourceKey.create(Registries.CREATIVE_MODE_TAB, Identifier.withDefaultNamespace("tools_and_utilities"));
		CreativeModeTabEvents.modifyOutputEvent(tools).register(output -> output.accept(SeamPickItems.SEAM_PICK));
		PlayerBlockBreakEvents.AFTER.register(SeamMiner::afterBreak);
		LOGGER.info("[seam-pick] ready");
	}

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}
}
