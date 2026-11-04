package mc.glched.tidewand;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.network.protocol.game.ClientboundSetEntityMotionPacket;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.level.entity.EntityTypeTest;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

public final class TideWells {
	private static final List<Well> WELLS = new ArrayList<>();

	private TideWells() {
	}

	public static void spawn(ServerLevel level, Vec3 center) {
		WELLS.add(new Well(level, center, level.getGameTime() + TideWand.CONFIG.wellDurationTicks));
		level.sendParticles(ParticleTypes.END_ROD, center.x, center.y, center.z, 12, 0.4, 0.2, 0.4, 0.02);
	}

	public static void tick(MinecraftServer server) {
		if (WELLS.isEmpty()) {
			return;
		}
		Iterator<Well> iterator = WELLS.iterator();
		while (iterator.hasNext()) {
			Well well = iterator.next();
			if (well.level().getGameTime() >= well.expiresAt() || !well.level().isLoaded(BlockPos.containing(well.center()))) {
				iterator.remove();
				continue;
			}
			pullItems(well);
			liftPlayers(well);
			if (well.level().getGameTime() % 8L == 0L) {
				well.level().sendParticles(ParticleTypes.ENCHANT, well.center().x, well.center().y, well.center().z, 4, 0.6, 0.3, 0.6, 0.2);
			}
		}
	}

	private static void pullItems(Well well) {
		double radius = TideWand.CONFIG.wellRadius;
		AABB box = new AABB(well.center(), well.center()).inflate(radius);
		for (ItemEntity item : well.level().getEntities(EntityTypeTest.forClass(ItemEntity.class), box, entity -> true)) {
			Vec3 toward = well.center().subtract(item.position());
			double distance = toward.length();
			if (distance < 0.4 || distance > radius) {
				continue;
			}
			item.setDeltaMovement(item.getDeltaMovement().scale(0.55).add(toward.normalize().scale(TideWand.CONFIG.wellPull)));
			item.syncVelocity = true;
		}
	}

	private static void liftPlayers(Well well) {
		for (ServerPlayer player : well.level().players()) {
			if (player.isSpectator() || player.getAbilities().flying) {
				continue;
			}
			if (player.position().distanceToSqr(well.center()) > 3.5 * 3.5) {
				continue;
			}
			if (player.getY() > well.center().y + 3.5) {
				player.resetFallDistance();
				continue;
			}
			Vec3 motion = player.getDeltaMovement();
			player.setDeltaMovement(motion.x, Math.min(0.12, motion.y + 0.05), motion.z);
			player.syncVelocity = true;
			player.connection.send(new ClientboundSetEntityMotionPacket(player));
			player.resetFallDistance();
		}
	}

	private record Well(ServerLevel level, Vec3 center, long expiresAt) {
	}
}
