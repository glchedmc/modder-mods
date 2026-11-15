package mc.glched.glasscompanion.modules;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.inventory.CreativeModeInventoryScreen;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.inventory.InventoryMenu;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.ItemStack;

/**
 * Client-only sorter for the 27 main inventory slots. Never touches the hotbar,
 * armor, offhand, or crafting grid. Applies the layout with ordinary pickup clicks
 * so it works on vanilla servers.
 */
public final class InventorySorter {
	private static final int MAX_CLICKS = 256;

	private InventorySorter() {
	}

	public static void sort(Minecraft minecraft) {
		LocalPlayer player = minecraft.player;
		if (player == null || minecraft.gameMode == null) {
			return;
		}
		if (player.isSpectator()) {
			player.sendSystemMessage(Component.translatable("message.glass-companion.sort.spectator"));
			return;
		}
		if (player.isCreative() || minecraft.gui.screen() instanceof CreativeModeInventoryScreen) {
			player.sendSystemMessage(Component.translatable("message.glass-companion.sort.creative"));
			return;
		}

		var screen = minecraft.gui.screen();
		if (screen != null && !(screen instanceof InventoryScreen)) {
			if (player.containerMenu != player.inventoryMenu) {
				player.sendSystemMessage(Component.translatable("message.glass-companion.sort.busy"));
			}
			return;
		}
		if (player.containerMenu != player.inventoryMenu) {
			player.sendSystemMessage(Component.translatable("message.glass-companion.sort.busy"));
			return;
		}

		InventoryMenu menu = player.inventoryMenu;
		int start = InventoryMenu.INV_SLOT_START;
		int end = InventoryMenu.INV_SLOT_END;

		if (!menu.getCarried().isEmpty()) {
			parkCarried(minecraft, menu, start, end, -1);
			if (!menu.getCarried().isEmpty()) {
				player.sendSystemMessage(Component.translatable("message.glass-companion.sort.cursor"));
				return;
			}
		}

		List<ItemStack> target = buildTarget(menu, start, end);
		if (alreadySorted(menu, start, end, target)) {
			player.sendSystemMessage(Component.translatable("message.glass-companion.sort.sorted", stackCount(target)));
			return;
		}

		boolean finished = applyClicks(minecraft, menu, start, end, target);
		if (!menu.getCarried().isEmpty()) {
			parkCarried(minecraft, menu, start, end, -1);
		}
		if (finished && alreadySorted(menu, start, end, target) && menu.getCarried().isEmpty()) {
			player.sendSystemMessage(Component.translatable("message.glass-companion.sort.sorted", stackCount(target)));
		} else {
			player.sendSystemMessage(Component.translatable("message.glass-companion.sort.failed"));
		}
	}

	private static List<ItemStack> buildTarget(InventoryMenu menu, int start, int end) {
		List<ItemStack> packed = new ArrayList<>();
		for (int slot = start; slot < end; slot++) {
			ItemStack stack = menu.getSlot(slot).getItem();
			if (stack.isEmpty()) {
				continue;
			}
			mergeInto(packed, stack.copy());
		}
		packed.sort(Comparator
				.comparingInt(InventorySorter::category)
				.thenComparing(stack -> BuiltInRegistries.ITEM.getKey(stack.getItem()).toString())
				.thenComparing(Comparator.comparingInt(ItemStack::getCount).reversed()));
		List<ItemStack> target = new ArrayList<>(end - start);
		for (int i = 0; i < end - start; i++) {
			target.add(i < packed.size() ? packed.get(i) : ItemStack.EMPTY);
		}
		return target;
	}

	/**
	 * Food, then blocks, then gear, then everything else — same order as Pocket Clerk.
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

	private static void mergeInto(List<ItemStack> packed, ItemStack incoming) {
		int left = incoming.getCount();
		if (incoming.isStackable()) {
			for (ItemStack existing : packed) {
				if (left <= 0) {
					break;
				}
				if (!ItemStack.isSameItemSameComponents(existing, incoming)) {
					continue;
				}
				int space = existing.getMaxStackSize() - existing.getCount();
				if (space <= 0) {
					continue;
				}
				int move = Math.min(space, left);
				existing.grow(move);
				left -= move;
			}
		}
		if (left > 0) {
			packed.add(incoming.copyWithCount(left));
		}
	}

	private static boolean alreadySorted(InventoryMenu menu, int start, int end, List<ItemStack> target) {
		for (int slot = start; slot < end; slot++) {
			if (!ItemStack.matches(menu.getSlot(slot).getItem(), target.get(slot - start))) {
				return false;
			}
		}
		return true;
	}

	private static int stackCount(List<ItemStack> target) {
		int count = 0;
		for (ItemStack stack : target) {
			if (!stack.isEmpty()) {
				count++;
			}
		}
		return count;
	}

	private static boolean applyClicks(Minecraft minecraft, InventoryMenu menu, int start, int end, List<ItemStack> target) {
		// Pack identical stacks in place first so the remaining work is a permutation.
		if (!mergeExistingStacks(minecraft, menu, start, end)) {
			return false;
		}
		int clicks = 0;
		while (clicks < MAX_CLICKS) {
			if (!menu.getCarried().isEmpty()) {
				int dest = findTargetSlotForCarried(menu, start, end, target);
				if (dest < 0) {
					dest = findEmptySlot(menu, start, end, -1);
				}
				if (dest < 0) {
					return false;
				}
				pickupClick(minecraft, menu, dest);
				clicks++;
				continue;
			}
			int wrong = findOccupiedMismatchedSlot(menu, start, end, target);
			if (wrong < 0) {
				return alreadySorted(menu, start, end, target);
			}
			pickupClick(minecraft, menu, wrong);
			clicks++;
		}
		return false;
	}

	private static boolean mergeExistingStacks(Minecraft minecraft, InventoryMenu menu, int start, int end) {
		int clicks = 0;
		for (int i = start; i < end; i++) {
			ItemStack destination = menu.getSlot(i).getItem();
			if (destination.isEmpty() || destination.getCount() >= destination.getMaxStackSize()) {
				continue;
			}
			for (int j = i + 1; j < end; j++) {
				destination = menu.getSlot(i).getItem();
				if (destination.getCount() >= destination.getMaxStackSize()) {
					break;
				}
				ItemStack source = menu.getSlot(j).getItem();
				if (source.isEmpty() || !ItemStack.isSameItemSameComponents(source, destination)) {
					continue;
				}
				if (clicks + 3 > MAX_CLICKS) {
					return false;
				}
				pickupClick(minecraft, menu, j);
				clicks++;
				pickupClick(minecraft, menu, i);
				clicks++;
				if (!menu.getCarried().isEmpty()) {
					pickupClick(minecraft, menu, j);
					clicks++;
				}
			}
		}
		return menu.getCarried().isEmpty();
	}

	private static int findOccupiedMismatchedSlot(InventoryMenu menu, int start, int end, List<ItemStack> target) {
		for (int slot = start; slot < end; slot++) {
			ItemStack have = menu.getSlot(slot).getItem();
			if (!have.isEmpty() && !ItemStack.matches(have, target.get(slot - start))) {
				return slot;
			}
		}
		return -1;
	}

	private static int findTargetSlotForCarried(InventoryMenu menu, int start, int end, List<ItemStack> target) {
		ItemStack carried = menu.getCarried();
		if (carried.isEmpty()) {
			return -1;
		}
		for (int slot = start; slot < end; slot++) {
			ItemStack want = target.get(slot - start);
			if (ItemStack.matches(want, carried) && !ItemStack.matches(menu.getSlot(slot).getItem(), want)) {
				return slot;
			}
		}
		for (int slot = start; slot < end; slot++) {
			ItemStack want = target.get(slot - start);
			if (!want.isEmpty()
					&& ItemStack.isSameItemSameComponents(want, carried)
					&& !ItemStack.matches(menu.getSlot(slot).getItem(), want)) {
				return slot;
			}
		}
		return -1;
	}

	private static void parkCarried(Minecraft minecraft, AbstractContainerMenu menu, int start, int end, int avoid) {
		int guard = 0;
		while (!menu.getCarried().isEmpty() && guard++ < 40) {
			ItemStack carried = menu.getCarried();
			int dest = -1;
			for (int slot = start; slot < end; slot++) {
				if (slot == avoid) {
					continue;
				}
				ItemStack there = menu.getSlot(slot).getItem();
				if (!there.isEmpty()
						&& ItemStack.isSameItemSameComponents(there, carried)
						&& there.getCount() < there.getMaxStackSize()) {
					dest = slot;
					break;
				}
			}
			if (dest < 0) {
				dest = findEmptySlot(menu, start, end, avoid);
			}
			if (dest < 0) {
				return;
			}
			pickupClick(minecraft, menu, dest);
		}
	}

	private static int findEmptySlot(AbstractContainerMenu menu, int start, int end, int avoid) {
		for (int slot = start; slot < end; slot++) {
			if (slot != avoid && menu.getSlot(slot).getItem().isEmpty()) {
				return slot;
			}
		}
		return -1;
	}

	private static void pickupClick(Minecraft minecraft, AbstractContainerMenu menu, int slot) {
		minecraft.gameMode.handleContainerInput(menu.containerId, slot, 0, ContainerInput.PICKUP, minecraft.player);
	}
}
