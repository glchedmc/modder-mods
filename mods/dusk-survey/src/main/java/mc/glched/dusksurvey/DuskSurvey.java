package mc.glched.dusksurvey;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.CreativeModeTab;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class DuskSurvey implements ModInitializer {
	public static final String MOD_ID = "dusk-survey";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);
	public static DuskSurveyConfig CONFIG = new DuskSurveyConfig();

	@Override
	public void onInitialize() {
		CONFIG = DuskSurveyConfig.load();
		DuskSurveyItems.initialize();
		ResourceKey<CreativeModeTab> tools = ResourceKey.create(Registries.CREATIVE_MODE_TAB, Identifier.withDefaultNamespace("tools_and_utilities"));
		CreativeModeTabEvents.modifyOutputEvent(tools).register(output -> output.accept(DuskSurveyItems.DUSK_SURVEY));
		LOGGER.info("[dusk-survey] ready");
	}

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}
}
