package mc.glched.pocketclerk;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.ItemStack;

public final class ClerkActions {
	private ClerkActions() {
	}

	public static void handle(ServerPlayer player, int action) {
		if (action == ClerkActionPayload.SORT) {
			sortPockets(player);
		} else if (action == ClerkActionPayload.QUICK_STACK) {
			fileMatching(player);
		}
	}

	private static void sortPockets(ServerPlayer player) {
		Inventory inventory = player.getInventory();
		int limit = Math.min(36, inventory.getContainerSize());
		int from = PocketClerk.CONFIG.sortHotbar ? 0 : Math.min(9, limit);
		List<ItemStack> stacks = new ArrayList<>();
		for (int slot = from; slot < limit; slot++) {
			ItemStack stack = inventory.getItem(slot);
			if (!stack.isEmpty()) {
				stacks.add(stack.copy());
			}
			inventory.setItem(slot, ItemStack.EMPTY);
		}
		stacks.sort(Comparator
				.comparingInt(ClerkActions::category)
				.thenComparing(stack -> BuiltInRegistries.ITEM.getKey(stack.getItem()).toString())
				.thenComparing(Comparator.comparingInt(ItemStack::getCount).reversed()));
		int cursor = from;
		for (ItemStack stack : stacks) {
			if (cursor >= limit) {
				break;
			}
			inventory.setItem(cursor++, stack);
		}
		player.inventoryMenu.broadcastChanges();
		if (player.containerMenu != player.inventoryMenu) {
			player.containerMenu.broadcastChanges();
		}
		player.sendSystemMessage(Component.translatable("message.pocket-clerk.sorted", stacks.size()));
	}

	/**
	 * Food, then blocks, then gear, then everything else. Bundles stay with gear so they
	 * are not scattered through the block section.
	 */
	private static int category(ItemStack stack) {
		if (stack.has(DataComponents.FOOD)) {
			return 0;
		}
		if (stack.getItem() instanceof BlockItem) {
			return 1;
		}
		if (stack.has(DataComponents.TOOL) || stack.has(DataComponents.WEAPON) || stack.has(DataComponents.EQUIPPABLE)) {
			return 2;
		}
		return 3;
	}

	private static void fileMatching(ServerPlayer player) {
		AbstractContainerMenu menu = player.containerMenu;
		if (menu == player.inventoryMenu) {
			player.sendSystemMessage(Component.translatable("message.pocket-clerk.no_container"));
			return;
		}

		List<Slot> containerSlots = new ArrayList<>();
		List<Slot> pocketSlots = new ArrayList<>();
		for (Slot slot : menu.slots) {
			if (slot.container == player.getInventory()) {
				int index = slot.getContainerSlot();
				boolean hotbar = index >= 0 && index < 9;
				if (!hotbar || PocketClerk.CONFIG.quickStackHotbar) {
					if (index < 36) {
						pocketSlots.add(slot);
					}
				}
			} else {
				containerSlots.add(slot);
			}
		}
		if (containerSlots.isEmpty()) {
			player.sendSystemMessage(Component.translatable("message.pocket-clerk.no_container"));
			return;
		}

		int moved = 0;
		for (Slot from : pocketSlots) {
			ItemStack stack = from.getItem();
			if (stack.isEmpty() || !containerAlreadyHolds(containerSlots, stack)) {
				continue;
			}
			moved += mergeInto(containerSlots, stack, false);
			moved += mergeInto(containerSlots, stack, true);
			from.set(stack.isEmpty() ? ItemStack.EMPTY : stack);
			from.setChanged();
		}
		menu.broadcastChanges();
		if (moved == 0) {
			player.sendSystemMessage(Component.translatable("message.pocket-clerk.nothing_filed"));
		} else {
			player.sendSystemMessage(Component.translatable("message.pocket-clerk.filed", moved));
		}
	}

	private static boolean containerAlreadyHolds(List<Slot> containerSlots, ItemStack stack) {
		for (Slot slot : containerSlots) {
			ItemStack existing = slot.getItem();
			if (!existing.isEmpty() && ItemStack.isSameItemSameComponents(existing, stack)) {
				return true;
			}
		}
		return false;
	}

	private static int mergeInto(List<Slot> containerSlots, ItemStack stack, boolean emptySlots) {
		int moved = 0;
		for (Slot slot : containerSlots) {
			if (stack.isEmpty()) {
				break;
			}
			ItemStack destination = slot.getItem();
			if (emptySlots) {
				if (!destination.isEmpty() || !slot.mayPlace(stack)) {
					continue;
				}
				int amount = Math.min(stack.getCount(), Math.min(stack.getMaxStackSize(), slot.getMaxStackSize()));
				if (amount <= 0) {
					continue;
				}
				ItemStack placed = stack.copy();
				placed.setCount(amount);
				slot.set(placed);
				stack.shrink(amount);
				slot.setChanged();
				moved += amount;
				continue;
			}
			if (destination.isEmpty() || !ItemStack.isSameItemSameComponents(destination, stack) || !slot.mayPlace(stack)) {
				continue;
			}
			int space = Math.min(destination.getMaxStackSize(), slot.getMaxStackSize()) - destination.getCount();
			if (space <= 0) {
				continue;
			}
			int amount = Math.min(space, stack.getCount());
			destination.grow(amount);
			stack.shrink(amount);
			slot.setChanged();
			moved += amount;
		}
		return moved;
	}
}
