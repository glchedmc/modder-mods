package mc.glched.pocketclerk;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;

import com.mojang.blaze3d.platform.InputConstants;

public final class PocketClerkClient implements ClientModInitializer {
	private static KeyMapping sortKey;
	private static KeyMapping fileKey;
	private static long lastHandledTick = Long.MIN_VALUE;

	@Override
	public void onInitializeClient() {
		KeyMapping.Category category = KeyMapping.Category.register(PocketClerk.id("clerk"));
		sortKey = KeyMappingHelper.registerKeyMapping(new KeyMapping(
				"key.pocket-clerk.sort",
				InputConstants.Type.KEYBOARD,
				InputConstants.KEY_R,
				category
		));
		fileKey = KeyMappingHelper.registerKeyMapping(new KeyMapping(
				"key.pocket-clerk.quick_stack",
				InputConstants.Type.KEYBOARD,
				InputConstants.KEY_G,
				category
		));

		ClientTickEvents.END_CLIENT_TICK.register(client -> {
			while (sortKey.consumeClick()) {
				send(client, ClerkActionPayload.SORT);
			}
			while (fileKey.consumeClick()) {
				send(client, ClerkActionPayload.QUICK_STACK);
			}
		});

		ScreenEvents.BEFORE_INIT.register((client, screen, scaledWidth, scaledHeight) -> {
			ScreenKeyboardEvents.beforeKeyPress(screen).register((current, keyEvent) -> {
				if (sortKey.matches(keyEvent)) {
					send(client, ClerkActionPayload.SORT);
				} else if (fileKey.matches(keyEvent)) {
					send(client, ClerkActionPayload.QUICK_STACK);
				}
			});
		});
	}

	private static void send(Minecraft client, int action) {
		if (client.player == null || client.getConnection() == null || client.level == null) {
			return;
		}
		long tick = client.level.getGameTime();
		if (tick == lastHandledTick) {
			return;
		}
		lastHandledTick = tick;
		ClientPlayNetworking.send(new ClerkActionPayload(action));
	}
}
