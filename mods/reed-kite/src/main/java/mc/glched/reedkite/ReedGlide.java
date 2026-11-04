package mc.glched.reedkite;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import net.minecraft.network.protocol.game.ClientboundSetEntityMotionPacket;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;

public final class ReedGlide {
	private static final Set<UUID> GLIDING = new HashSet<>();

	private ReedGlide() {
	}

	public static void forget(UUID playerId) {
		GLIDING.remove(playerId);
	}

	public static void tick(MinecraftServer server) {
		for (ServerPlayer player : server.getPlayerList().getPlayers()) {
			Handful handful = held(player);
			if (handful == null || !falling(player)) {
				GLIDING.remove(player.getUUID());
				continue;
			}
			Vec3 look = Entity.calculateViewVector(0.0F, player.getYRot());
			Vec3 motion = player.getDeltaMovement();
			double y = motion.y < -ReedKite.CONFIG.maxFallSpeed ? -ReedKite.CONFIG.maxFallSpeed : motion.y;
			double hx = motion.x * 0.92 + look.x * ReedKite.CONFIG.drift;
			double hz = motion.z * 0.92 + look.z * ReedKite.CONFIG.drift;
			double horizontal = Math.hypot(hx, hz);
			if (horizontal > ReedKite.CONFIG.maxHorizontal) {
				double scale = ReedKite.CONFIG.maxHorizontal / horizontal;
				hx *= scale;
				hz *= scale;
			}
			player.setDeltaMovement(hx, y, hz);
			player.syncVelocity = true;
			player.connection.send(new ClientboundSetEntityMotionPacket(player));
			player.resetFallDistance();
			if (GLIDING.add(player.getUUID())) {
				player.level().playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.WIND_CHARGE_THROW, SoundSource.PLAYERS, 0.35F, 1.4F);
			}
			if (server.getTickCount() % 20 == 0) {
				if (ReedKite.CONFIG.exhaustionPerSecond > 0.0F) {
					player.causeFoodExhaustion(ReedKite.CONFIG.exhaustionPerSecond);
				}
				if (!player.getAbilities().instabuild && ReedKite.CONFIG.durabilityPerSecond > 0) {
					handful.stack.hurtAndBreak(ReedKite.CONFIG.durabilityPerSecond, player, handful.slot);
				}
			}
		}
	}

	private static boolean falling(ServerPlayer player) {
		if (!player.isAlive() || player.isSpectator() || player.isShiftKeyDown() || player.onGround()) {
			return false;
		}
		if (player.isInWater() || player.isInLava() || player.isFallFlying() || player.isPassenger()) {
			return false;
		}
		if (player.getAbilities().flying) {
			return false;
		}
		return player.getDeltaMovement().y < -0.04;
	}

	private static Handful held(ServerPlayer player) {
		ItemStack main = player.getMainHandItem();
		if (main.getItem() instanceof ReedKiteItem) {
			return new Handful(main, EquipmentSlot.MAINHAND);
		}
		ItemStack off = player.getItemBySlot(EquipmentSlot.OFFHAND);
		if (off.getItem() instanceof ReedKiteItem) {
			return new Handful(off, EquipmentSlot.OFFHAND);
		}
		return null;
	}

	private record Handful(ItemStack stack, EquipmentSlot slot) {
	}
}
