package mc.glched.glasscompanion.modules;

import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.BowItem;
import net.minecraft.world.item.CrossbowItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

/** Lunar's Item Counter: how many of the held item you carry, or arrows when holding a bow. */
public final class ItemCounter {
	public record Count(ItemStack icon, int total) {
	}

	private ItemCounter() {
	}

	public static Count current(LocalPlayer player, boolean sample) {
		ItemStack held = player.getMainHandItem();
		Inventory inv = player.getInventory();
		if (held.isEmpty()) {
			return sample ? new Count(new ItemStack(Items.ARROW), 64) : null;
		}
		boolean bow = held.getItem() instanceof BowItem || held.getItem() instanceof CrossbowItem;
		int total = 0;
		ItemStack icon = bow ? new ItemStack(Items.ARROW) : held.copyWithCount(1);
		for (int i = 0; i < inv.getContainerSize(); i++) {
			ItemStack s = inv.getItem(i);
			if (s.isEmpty()) {
				continue;
			}
			if (bow ? (s.is(Items.ARROW) || s.is(Items.SPECTRAL_ARROW) || s.is(Items.TIPPED_ARROW)) : ItemStack.isSameItem(s, held)) {
				total += s.getCount();
			}
		}
		if (!bow && total <= 1 && !held.isStackable()) {
			return sample ? new Count(icon, 1) : null;
		}
		return new Count(icon, total);
	}
}
