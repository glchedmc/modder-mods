package mc.glched.stacklure;

import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.entity.EntityTypeTest;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

public final class StackDrawer {
	private StackDrawer() {
	}

	public static void tick(MinecraftServer server) {
		int interval = StackLure.CONFIG.intervalTicks;
		if (interval > 1 && server.getTickCount() % interval != 0) {
			return;
		}
		for (ServerPlayer player : server.getPlayerList().getPlayers()) {
			if (!armed(player)) {
				continue;
			}
			pull(player);
		}
	}

	private static boolean armed(ServerPlayer player) {
		if (!player.isAlive() || player.isSpectator() || player.isShiftKeyDown()) {
			return false;
		}
		Inventory inventory = player.getInventory();
		int limit = Math.min(36, inventory.getContainerSize());
		for (int slot = 0; slot < limit; slot++) {
			ItemStack stack = inventory.getItem(slot);
			if (stack.is(StackLureItems.STACK_LURE) && !StackLureItem.isQuiet(stack)) {
				return true;
			}
		}
		ItemStack offhand = player.getItemBySlot(EquipmentSlot.OFFHAND);
		return offhand.is(StackLureItems.STACK_LURE) && !StackLureItem.isQuiet(offhand);
	}

	private static void pull(ServerPlayer player) {
		ServerLevel level = player.level();
		double radius = StackLure.CONFIG.radius;
		AABB box = player.getBoundingBox().inflate(radius);
		int pulled = 0;
		for (ItemEntity item : level.getEntities(EntityTypeTest.forClass(ItemEntity.class), box, entity -> true)) {
			if (pulled >= StackLure.CONFIG.maxPerPass) {
				break;
			}
			if (!item.isAlive() || item.hasPickUpDelay() || item.getItem().isEmpty()) {
				continue;
			}
			if (item.position().distanceToSqr(player.position()) > radius * radius) {
				continue;
			}
			if (!wants(player, item.getItem())) {
				continue;
			}
			Vec3 toward = player.position().add(0.0, 0.45, 0.0).subtract(item.position());
			double distance = toward.length();
			if (distance < 0.55) {
				continue;
			}
			double speed = Math.min(StackLure.CONFIG.speed, 0.1 + distance * 0.08);
			item.setDeltaMovement(toward.scale(speed / distance));
			item.syncVelocity = true;
			pulled++;
		}
	}

	/**
	 * Only top up a stack that already has room, unless the config also allows a lure
	 * toward a full stack of the same item.
	 */
	private static boolean wants(ServerPlayer player, ItemStack dropped) {
		if (dropped.is(StackLureItems.STACK_LURE)) {
			return false;
		}
		Inventory inventory = player.getInventory();
		int limit = Math.min(36, inventory.getContainerSize());
		boolean matched = false;
		for (int slot = 0; slot < limit; slot++) {
			ItemStack have = inventory.getItem(slot);
			if (have.isEmpty() || !ItemStack.isSameItemSameComponents(have, dropped)) {
				continue;
			}
			matched = true;
			if (have.getCount() < have.getMaxStackSize()) {
				return true;
			}
		}
		ItemStack offhand = player.getItemBySlot(EquipmentSlot.OFFHAND);
		if (!offhand.isEmpty() && ItemStack.isSameItemSameComponents(offhand, dropped)) {
			matched = true;
			if (offhand.getCount() < offhand.getMaxStackSize()) {
				return true;
			}
		}
		return matched && StackLure.CONFIG.pullFullStacks;
	}
}
