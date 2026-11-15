package mc.glched.glasscompanion.modules;

import java.util.HashMap;
import java.util.Map;

import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;

/** From Fray Bell: one warning and a soft ding when worn or held gear falls below 10%. */
public final class DurabilityAlert {
	private static final Map<EquipmentSlot, Integer> WARNED = new HashMap<>();

	private DurabilityAlert() {
	}

	public static void tick(Minecraft mc) {
		LocalPlayer p = mc.player;
		if (p == null) {
			WARNED.clear();
			return;
		}
		for (EquipmentSlot slot : EquipmentSlot.values()) {
			ItemStack s = p.getItemBySlot(slot);
			if (s.isEmpty() || !s.isDamageableItem()) {
				WARNED.remove(slot);
				continue;
			}
			int left = s.getMaxDamage() - s.getDamageValue();
			boolean low = left <= Math.max(1, s.getMaxDamage() / 10);
			int id = System.identityHashCode(s.getItem());
			if (low && !Integer.valueOf(id).equals(WARNED.get(slot))) {
				WARNED.put(slot, id);
				p.sendOverlayMessage(Component.literal("⚠ " + s.getHoverName().getString() + " is almost broken (" + left + " left)").withStyle(ChatFormatting.GOLD));
				p.playSound(SoundEvents.NOTE_BLOCK_BELL.value(), 0.6f, 1.4f);
			} else if (!low) {
				WARNED.remove(slot);
			}
		}
	}
}
