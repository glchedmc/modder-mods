package mc.glched.glasscompanion.modules;

import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.BowItem;
import net.minecraft.world.item.CrossbowItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

/**
 * Held item count (Lunar's Item Counter): how many of the held item you carry
 * across the whole inventory (hold cobblestone → 342), arrows when holding a
 * bow or crossbow, and durability left for tools, weapons and armor.
 */
public final class ItemCounter {
	/** total is -1 when there is nothing to count (a single tool); durability is -1 for undamageable items. */
	public record Count(ItemStack icon, int total, int durability, int maxDurability) {
	}

	private ItemCounter() {
	}

	public static Count current(LocalPlayer player, boolean sample) {
		ItemStack held = player.getMainHandItem();
		Inventory inv = player.getInventory();
		if (held.isEmpty()) {
			return sample ? new Count(new ItemStack(Items.COBBLESTONE), 342, -1, 0) : null;
		}
		boolean bow = held.getItem() instanceof BowItem || held.getItem() instanceof CrossbowItem;
		int total = 0;
		for (int i = 0; i < inv.getContainerSize(); i++) {
			ItemStack s = inv.getItem(i);
			if (s.isEmpty()) {
				continue;
			}
			if (bow ? (s.is(Items.ARROW) || s.is(Items.SPECTRAL_ARROW) || s.is(Items.TIPPED_ARROW)) : ItemStack.isSameItem(s, held)) {
				total += s.getCount();
			}
		}
		int dur = held.isDamageableItem() ? held.getMaxDamage() - held.getDamageValue() : -1;
		int max = held.isDamageableItem() ? held.getMaxDamage() : 0;
		ItemStack icon = bow ? new ItemStack(Items.ARROW) : held.copyWithCount(1);
		if (bow) {
			return new Count(icon, total, dur, max);
		}
		// A lone tool has nothing to count; show just its durability.
		if (!held.isStackable() && total <= 1) {
			return dur >= 0 ? new Count(icon, -1, dur, max) : null;
		}
		return new Count(icon, total, dur, max);
	}
}
