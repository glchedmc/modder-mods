package mc.glched.fraybell;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.game.ClientboundSetActionBarTextPacket;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;

public final class FrayWatcher {
	private static final Map<UUID, Map<String, Integer>> LAST_BAND = new HashMap<>();

	private FrayWatcher() {
	}

	public static void tick(MinecraftServer server) {
		if (server.getTickCount() % 10 != 0) {
			return;
		}
		for (ServerPlayer player : server.getPlayerList().getPlayers()) {
			watch(player);
		}
	}

	public static void forget(ServerPlayer player) {
		LAST_BAND.remove(player.getUUID());
	}

	private static void watch(ServerPlayer player) {
		if (player.getAbilities().instabuild) {
			return;
		}
		Map<String, Integer> bands = LAST_BAND.computeIfAbsent(player.getUUID(), ignored -> new HashMap<>());
		ItemStack crossed = ItemStack.EMPTY;
		int crossedPercent = 101;

		if (FrayBell.CONFIG.checkHand) {
			crossed = prefer(crossed, crossedPercent, consider(bands, "hand", player.getMainHandItem()));
			crossedPercent = percentLeft(crossed);
		}
		if (FrayBell.CONFIG.checkHotbar) {
			int hotbar = Math.min(9, player.getInventory().getContainerSize());
			for (int slot = 0; slot < hotbar; slot++) {
				ItemStack stack = consider(bands, "hotbar-" + slot, player.getInventory().getItem(slot));
				if (percentLeft(stack) < crossedPercent) {
					crossed = stack;
					crossedPercent = percentLeft(stack);
				}
			}
		}
		if (FrayBell.CONFIG.checkArmor) {
			for (EquipmentSlot slot : new EquipmentSlot[] {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET, EquipmentSlot.OFFHAND}) {
				ItemStack stack = consider(bands, slot.getName(), player.getItemBySlot(slot));
				if (percentLeft(stack) < crossedPercent) {
					crossed = stack;
					crossedPercent = percentLeft(stack);
				}
			}
		}

		if (crossed.isEmpty()) {
			return;
		}
		player.connection.send(new ClientboundSetActionBarTextPacket(
				Component.translatable("message.fray-bell.fraying", crossed.getHoverName(), crossedPercent)
		));
		player.playSound(SoundEvents.NOTE_BLOCK_BELL.value(), 0.45F, 1.55F);
	}

	private static ItemStack prefer(ItemStack current, int currentPercent, ItemStack candidate) {
		if (candidate.isEmpty()) {
			return current;
		}
		return percentLeft(candidate) < currentPercent ? candidate : current;
	}

	/**
	 * Returns the stack when it has just crossed into a worse band, otherwise empty.
	 */
	private static ItemStack consider(Map<String, Integer> bands, String key, ItemStack stack) {
		if (!stack.isDamageableItem() || stack.getMaxDamage() <= 0) {
			bands.remove(key);
			return ItemStack.EMPTY;
		}
		double remaining = (stack.getMaxDamage() - stack.getDamageValue()) / (double) stack.getMaxDamage();
		int band = 0;
		for (double threshold : FrayBell.CONFIG.thresholds) {
			if (remaining <= threshold) {
				band++;
			}
		}
		int previous = bands.getOrDefault(key, 0);
		bands.put(key, band);
		return band > previous ? stack : ItemStack.EMPTY;
	}

	private static int percentLeft(ItemStack stack) {
		if (stack.isEmpty() || !stack.isDamageableItem() || stack.getMaxDamage() <= 0) {
			return 101;
		}
		int left = stack.getMaxDamage() - stack.getDamageValue();
		return Math.max(0, (left * 100) / stack.getMaxDamage());
	}
}
