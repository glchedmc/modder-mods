package mc.glched.restockchime;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.npc.villager.Villager;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.item.trading.MerchantOffers;
import net.minecraft.world.level.entity.EntityTypeTest;
import net.minecraft.world.phys.AABB;

public final class RestockWatches {
	private static final Map<UUID, Map<UUID, int[]>> WATCHES = new HashMap<>();

	private RestockWatches() {
	}

	public static int count(UUID playerId) {
		Map<UUID, int[]> watched = WATCHES.get(playerId);
		return watched == null ? 0 : watched.size();
	}

	public static int clear(UUID playerId) {
		Map<UUID, int[]> watched = WATCHES.remove(playerId);
		return watched == null ? 0 : watched.size();
	}

	/**
	 * @return trade count now being watched, 0 when the villager has no offers, or -1 when the list is full
	 */
	public static int watch(ServerPlayer player, Villager villager) {
		Map<UUID, int[]> watched = WATCHES.computeIfAbsent(player.getUUID(), ignored -> new HashMap<>());
		MerchantOffers offers = villager.getOffers();
		if (offers.isEmpty()) {
			return 0;
		}
		if (!watched.containsKey(villager.getUUID()) && watched.size() >= RestockChime.CONFIG.maxWatched) {
			return -1;
		}
		watched.put(villager.getUUID(), snapshot(offers));
		Component profession = villager.getVillagerData().profession().value().name();
		player.sendSystemMessage(Component.translatable("message.restock-chime.watching", profession, offers.size()));
		return offers.size();
	}

	public static void tick(MinecraftServer server) {
		if (WATCHES.isEmpty() || server.getTickCount() % RestockChime.CONFIG.intervalTicks != 0) {
			return;
		}
		for (ServerPlayer player : server.getPlayerList().getPlayers()) {
			Map<UUID, int[]> watched = WATCHES.get(player.getUUID());
			if (watched == null || watched.isEmpty() || !carrying(player)) {
				continue;
			}
			scan(player, watched);
		}
	}

	private static void scan(ServerPlayer player, Map<UUID, int[]> watched) {
		ServerLevel level = player.level();
		double range = RestockChime.CONFIG.range;
		AABB box = player.getBoundingBox().inflate(range);
		List<Component> restocked = new ArrayList<>();
		for (Villager villager : level.getEntities(EntityTypeTest.forClass(Villager.class), box, entity -> watched.containsKey(entity.getUUID()))) {
			if (villager.position().distanceToSqr(player.position()) > range * range) {
				continue;
			}
			int[] previous = watched.get(villager.getUUID());
			MerchantOffers offers = villager.getOffers();
			int[] next = snapshot(offers);
			for (int index = 0; index < next.length && index < previous.length; index++) {
				if (next[index] < previous[index]) {
					MerchantOffer offer = offers.get(index);
					restocked.add(offer.getResult().getHoverName());
				}
			}
			watched.put(villager.getUUID(), next);
		}
		if (restocked.isEmpty()) {
			return;
		}
		Component first = restocked.get(0);
		if (restocked.size() == 1) {
			player.sendSystemMessage(Component.translatable("message.restock-chime.restocked", first));
		} else {
			player.sendSystemMessage(Component.translatable("message.restock-chime.restocked_more", first, restocked.size() - 1));
		}
		player.playSound(SoundEvents.NOTE_BLOCK_BELL.value(), 0.45F, 1.35F);
	}

	private static int[] snapshot(MerchantOffers offers) {
		int[] uses = new int[offers.size()];
		for (int index = 0; index < offers.size(); index++) {
			uses[index] = offers.get(index).getUses();
		}
		return uses;
	}

	private static boolean carrying(ServerPlayer player) {
		int limit = Math.min(36, player.getInventory().getContainerSize());
		for (int slot = 0; slot < limit; slot++) {
			if (player.getInventory().getItem(slot).is(RestockChimeItems.RESTOCK_CHIME)) {
				return true;
			}
		}
		ItemStack offhand = player.getItemBySlot(EquipmentSlot.OFFHAND);
		return offhand.is(RestockChimeItems.RESTOCK_CHIME);
	}
}
