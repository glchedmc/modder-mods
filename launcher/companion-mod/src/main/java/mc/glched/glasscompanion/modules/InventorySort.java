package mc.glched.glasscompanion.modules;

import mc.glched.glasscompanion.CompanionConfig;
import net.minecraft.client.Minecraft;

/** From Tidy Key: one key merges and sorts the 27 main inventory slots (hotbar, armor and offhand stay put). */
public final class InventorySort {
	private static long lastHandledTick = Long.MIN_VALUE;

	private InventorySort() {
	}

	public static void trigger(Minecraft client) {
		if (!CompanionConfig.module("inventorySort") || client.player == null || client.getConnection() == null || client.level == null) {
			return;
		}
		long tick = client.level.getGameTime();
		if (tick == lastHandledTick) {
			return;
		}
		lastHandledTick = tick;
		InventorySorter.sort(client);
	}
}
