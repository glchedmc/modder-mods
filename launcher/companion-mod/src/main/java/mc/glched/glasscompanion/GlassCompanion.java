package mc.glched.glasscompanion;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.mojang.blaze3d.platform.InputConstants;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.fabricmc.fabric.api.client.rendering.v1.ClientTooltipComponentCallback;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import mc.glched.glasscompanion.modules.ChunkBorders;
import mc.glched.glasscompanion.modules.DeathPoint;
import mc.glched.glasscompanion.modules.DurabilityAlert;
import mc.glched.glasscompanion.modules.EffectTimers;
import mc.glched.glasscompanion.modules.EchoArrow;
import mc.glched.glasscompanion.modules.Freelook;
import mc.glched.glasscompanion.modules.InventorySort;
import mc.glched.glasscompanion.modules.ShulkerPreview;
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
	public static KeyMapping freelookKey;
	public static KeyMapping sortKey;
	public static KeyMapping chunkKey;
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
		freelookKey = KeyMappingHelper.registerKeyMapping(new KeyMapping(
				"key.glass-companion.freelook", InputConstants.Type.KEYBOARD, InputConstants.KEY_LALT, category));
		sortKey = KeyMappingHelper.registerKeyMapping(new KeyMapping(
				"key.glass-companion.sort", InputConstants.Type.KEYBOARD, InputConstants.KEY_R, category));
		chunkKey = KeyMappingHelper.registerKeyMapping(new KeyMapping(
				"key.glass-companion.chunks", InputConstants.Type.KEYBOARD, InputConstants.KEY_F7, category));

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
		HudElementRegistry.attachElementAfter(VanillaHudElements.MOB_EFFECTS, id("effect_timers"), EffectTimers::extractHud);
		ClientTooltipComponentCallback.EVENT.register(data -> data instanceof ShulkerPreview.Data d ? new ShulkerPreview.Client(d) : null);
		ItemTooltipCallback.EVENT.register((stack, context, flag, lines) -> ShulkerPreview.filterLines(stack, lines));
		ItemTooltipCallback.EVENT.register(TooltipCompactor::compact);
		HudElementRegistry.addLast(id("echo_arrow"), EchoArrow::extractHud);
		EchoArrow.init();
		LevelRenderEvents.BEFORE_GIZMOS.register(context -> ChunkBorders.emit());
		// Sort key also works with the inventory or a container open (like Tidy Key).
		ScreenEvents.BEFORE_INIT.register((client, screen, w, h) -> {
			if (screen instanceof AbstractContainerScreen<?>) {
				ScreenKeyboardEvents.beforeKeyPress(screen).register((open, key) -> {
					if (sortKey.matches(key)) {
						InventorySort.trigger(client);
					}
				});
			}
		});
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
			Cosmetics.reloadIfChanged();
		}
		Zoom.tick(client);
		while (sortKey.consumeClick()) {
			InventorySort.trigger(client);
		}
		while (chunkKey.consumeClick()) {
			ChunkBorders.cycle(client);
		}
		Freelook.tick(client);
		EchoArrow.onEndTick(client);
		ChunkBorders.tick(client);
		DeathPoint.tick(client);
		if (CompanionConfig.module("durabilityAlert")) {
			DurabilityAlert.tick(client);
		}
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
