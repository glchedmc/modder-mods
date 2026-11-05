package mc.glched.lastlight;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import net.minecraft.core.BlockPos;
import net.minecraft.core.GlobalPos;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.game.ClientboundSetActionBarTextPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;

public final class LightGuide {
	private static final Map<UUID, Long> STARTED_AT = new HashMap<>();

	private LightGuide() {
	}

	public static void start(ServerPlayer player) {
		STARTED_AT.put(player.getUUID(), player.level().getGameTime());
		report(player, false);
	}

	public static void stop(UUID playerId) {
		STARTED_AT.remove(playerId);
	}

	public static void tick(MinecraftServer server) {
		if (STARTED_AT.isEmpty() || server.getTickCount() % 20 != 0) {
			return;
		}
		long duration = LastLight.CONFIG.guideSeconds * 20L;
		Iterator<Map.Entry<UUID, Long>> entries = STARTED_AT.entrySet().iterator();
		while (entries.hasNext()) {
			Map.Entry<UUID, Long> entry = entries.next();
			ServerPlayer player = server.getPlayerList().getPlayer(entry.getKey());
			if (player == null) {
				entries.remove();
				continue;
			}
			Optional<GlobalPos> death = player.getLastDeathLocation();
			if (death.isEmpty()) {
				entries.remove();
				continue;
			}
			if (player.level().getGameTime() - entry.getValue() > duration) {
				entries.remove();
				player.sendSystemMessage(Component.translatable("message.last-light.faded"));
				continue;
			}
			GlobalPos pos = death.get();
			if (player.level().dimension().equals(pos.dimension()) && distance(player, pos.pos()) <= LastLight.CONFIG.arrivalBlocks) {
				entries.remove();
				player.sendSystemMessage(Component.translatable("message.last-light.arrived"));
				player.playSound(SoundEvents.EXPERIENCE_ORB_PICKUP, 0.6F, 1.2F);
				continue;
			}
			player.connection.send(new ClientboundSetActionBarTextPacket(describe(player, pos, false)));
		}
	}

	public static void report(ServerPlayer player, boolean restartGuide) {
		Optional<GlobalPos> death = player.getLastDeathLocation();
		if (death.isEmpty()) {
			player.sendSystemMessage(Component.translatable("message.last-light.none"));
			return;
		}
		if (restartGuide) {
			STARTED_AT.put(player.getUUID(), player.level().getGameTime());
		}
		player.sendSystemMessage(describe(player, death.get(), true));
	}

	private static Component describe(ServerPlayer player, GlobalPos pos, boolean chat) {
		BlockPos block = pos.pos();
		Identifier dimension = pos.dimension().identifier();
		boolean same = player.level().dimension().equals(pos.dimension());
		if (!same) {
			return Component.translatable(
					"message.last-light.other_dimension",
					block.getX(), block.getY(), block.getZ(), dimension.toString()
			);
		}
		int blocks = (int) Math.round(distance(player, block));
		return Component.translatable(
				"message.last-light.here",
				block.getX(), block.getY(), block.getZ(), dimension.toString(), blocks, direction(player, block)
		);
	}

	private static double distance(ServerPlayer player, BlockPos pos) {
		double dx = pos.getX() + 0.5 - player.getX();
		double dy = pos.getY() - player.getY();
		double dz = pos.getZ() + 0.5 - player.getZ();
		return Math.sqrt(dx * dx + dy * dy + dz * dz);
	}

	private static Component direction(ServerPlayer player, BlockPos pos) {
		double dx = pos.getX() + 0.5 - player.getX();
		double dz = pos.getZ() + 0.5 - player.getZ();
		if (Math.abs(dx) < 2 && Math.abs(dz) < 2) {
			return Component.translatable("message.last-light.direction.here");
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
		return Component.translatable("message.last-light.direction." + key);
	}
}
