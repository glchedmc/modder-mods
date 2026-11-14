package mc.glched.glasscompanion;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.mojang.blaze3d.platform.InputConstants;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElement;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.Identifier;

public final class GlassCompanion implements ClientModInitializer {
	public static final String MOD_ID = "glass-companion";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

	public static KeyMapping menuKey;
	public static KeyMapping zoomKey;
	private static int configPollTicks;
	private static Integer savedFramerate;
	private static Boolean savedBob;

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}

	@Override
	public void onInitializeClient() {
		CompanionConfig.loadCatalog();
		CompanionConfig.load();

		KeyMapping.Category category = KeyMapping.Category.register(id("main"));
		menuKey = KeyMappingHelper.registerKeyMapping(new KeyMapping(
				"key.glass-companion.menu", InputConstants.Type.KEYBOARD, InputConstants.KEY_RSHIFT, category));
		zoomKey = KeyMappingHelper.registerKeyMapping(new KeyMapping(
				"key.glass-companion.zoom", InputConstants.Type.KEYBOARD, InputConstants.KEY_C, category));

		HudElementRegistry.addLast(id("hud"), HudRenderer::extract);
		HudElementRegistry.replaceElement(VanillaHudElements.CROSSHAIR, vanilla -> (HudElement) (graphics, delta) -> {
			if (CompanionConfig.bool("customCrosshair")) {
				CrosshairRenderer.extract(graphics);
			} else {
				vanilla.extractRenderState(graphics, delta);
			}
		});
		HudElementRegistry.replaceElement(VanillaHudElements.SCOREBOARD, vanilla -> (HudElement) (graphics, delta) -> {
			if (!CompanionConfig.bool("hideScoreboard")) {
				vanilla.extractRenderState(graphics, delta);
			}
		});
		ItemTooltipCallback.EVENT.register(TooltipCompactor::compact);
		ClientTickEvents.END_CLIENT_TICK.register(GlassCompanion::onTick);
		LOGGER.info("[glass-companion] ready with {} features", CompanionConfig.features().size());
	}

	private static void onTick(Minecraft client) {
		while (menuKey.consumeClick()) {
			if (client.gui.screen() == null) {
				client.gui.setScreen(new CompanionMenuScreen(null));
			}
		}
		if (++configPollTicks >= 40) {
			configPollTicks = 0;
			CompanionConfig.reloadIfChanged();
		}
		Zoom.tick(client);
		applyVanillaOptions(client);
	}

	/** Features that map onto existing vanilla options are applied, and restored when turned off. */
	private static void applyVanillaOptions(Minecraft client) {
		var options = client.options;
		if (CompanionConfig.bool("toggleSprint") && !options.toggleSprint().get()) {
			options.toggleSprint().set(true);
		}
		if (CompanionConfig.bool("toggleSneak") && !options.toggleCrouch().get()) {
			options.toggleCrouch().set(true);
		}
		if (CompanionConfig.bool("noViewBobbing")) {
			if (savedBob == null) {
				savedBob = options.bobView().get();
			}
			if (options.bobView().get()) {
				options.bobView().set(false);
			}
		} else if (savedBob != null) {
			options.bobView().set(savedBob);
			savedBob = null;
		}
		boolean background = CompanionConfig.bool("unfocusedFps") && !client.isWindowActive();
		if (background && savedFramerate == null) {
			savedFramerate = options.framerateLimit().get();
			options.framerateLimit().set(15);
		} else if (!background && savedFramerate != null) {
			options.framerateLimit().set(savedFramerate);
			savedFramerate = null;
		}
	}
}
