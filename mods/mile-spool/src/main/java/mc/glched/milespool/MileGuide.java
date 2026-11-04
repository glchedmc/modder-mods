package mc.glched.milespool;

import net.minecraft.core.component.DataComponents;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.game.ClientboundSetActionBarTextPacket;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.CustomData;

public final class MileGuide {
	private MileGuide() {
	}

	public static void tick(MinecraftServer server) {
		if (server.getTickCount() % MileSpool.CONFIG.guideIntervalTicks != 0) {
			return;
		}
		for (ServerPlayer player : server.getPlayerList().getPlayers()) {
			ItemStack stack = held(player);
			if (stack.isEmpty() || !MileSpoolItem.hasMark(stack)) {
				continue;
			}
			player.connection.send(new ClientboundSetActionBarTextPacket(describe(player, stack)));
		}
	}

	private static ItemStack held(ServerPlayer player) {
		ItemStack main = player.getMainHandItem();
		if (main.is(MileSpoolItems.MILE_SPOOL)) {
			return main;
		}
		ItemStack off = player.getItemBySlot(EquipmentSlot.OFFHAND);
		if (off.is(MileSpoolItems.MILE_SPOOL)) {
			return off;
		}
		return ItemStack.EMPTY;
	}

	private static Component describe(ServerPlayer player, ItemStack stack) {
		CompoundTag tag = stack.getOrDefault(DataComponents.CUSTOM_DATA, CustomData.EMPTY).copyTag();
		String dimension = tag.getStringOr("dim", "");
		int x = tag.getIntOr("x", 0);
		int y = tag.getIntOr("y", 0);
		int z = tag.getIntOr("z", 0);
		String here = player.level().dimension().identifier().toString();
		if (!here.equals(dimension)) {
			return Component.translatable("message.mile-spool.other", dimension, x, y, z);
		}
		double dx = x + 0.5 - player.getX();
		double dy = y - player.getY();
		double dz = z + 0.5 - player.getZ();
		int blocks = (int) Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));
		if (blocks <= 2) {
			return Component.translatable("message.mile-spool.arrived");
		}
		return Component.translatable(
				"message.mile-spool.track",
				blocks,
				direction(dx, dz),
				vertical(dy),
				x,
				y,
				z
		);
	}

	private static Component vertical(double dy) {
		int steps = (int) Math.round(Math.abs(dy));
		if (dy > 3) {
			return Component.translatable("message.mile-spool.up", steps);
		}
		if (dy < -3) {
			return Component.translatable("message.mile-spool.down", steps);
		}
		return Component.translatable("message.mile-spool.level");
	}

	private static Component direction(double dx, double dz) {
		if (Math.abs(dx) < 2 && Math.abs(dz) < 2) {
			return Component.translatable("message.mile-spool.direction.here");
		}
		String east = dx > 0 ? "east" : "west";
		String south = dz > 0 ? "south" : "north";
		double ax = Math.abs(dx);
		double az = Math.abs(dz);
		String key;
		if (ax > az * 1.8) {
			key = east;
		} else if (az > ax * 1.8) {
			key = south;
		} else {
			key = south + east;
		}
		return Component.translatable("message.mile-spool.direction." + key);
	}
}
