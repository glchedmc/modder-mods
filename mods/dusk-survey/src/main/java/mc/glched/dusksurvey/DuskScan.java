package mc.glched.dusksurvey;

import java.util.ArrayList;
import java.util.List;

import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.SpawnPlacements;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.LightLayer;

public final class DuskScan {
	private DuskScan() {
	}

	public static InteractionResult survey(Player player, InteractionHand hand, ItemStack stack) {
		if (!(player instanceof ServerPlayer serverPlayer) || !(player.level() instanceof ServerLevel level)) {
			return InteractionResult.FAIL;
		}
		int radius = DuskSurvey.CONFIG.radius;
		int vertical = DuskSurvey.CONFIG.vertical;
		BlockPos origin = serverPlayer.blockPosition();
		BlockPos.MutableBlockPos cursor = new BlockPos.MutableBlockPos();
		int count = 0;
		BlockPos nearest = null;
		double nearestDistance = Double.MAX_VALUE;
		List<BlockPos> marks = new ArrayList<>();
		for (int dy = -vertical; dy <= vertical; dy++) {
			for (int dx = -radius; dx <= radius; dx++) {
				for (int dz = -radius; dz <= radius; dz++) {
					if (dx * dx + dz * dz > radius * radius) {
						continue;
					}
					cursor.set(origin.getX() + dx, origin.getY() + dy, origin.getZ() + dz);
					if (!spawnable(level, cursor)) {
						continue;
					}
					count++;
					double distance = cursor.distSqr(origin);
					if (distance < nearestDistance) {
						nearestDistance = distance;
						nearest = cursor.immutable();
					}
					if (marks.size() < 8) {
						marks.add(cursor.immutable());
					} else {
						replaceFarthest(marks, origin, cursor);
					}
				}
			}
		}
		boolean feet = spawnable(level, origin);
		if (count == 0) {
			serverPlayer.sendSystemMessage(Component.translatable("message.dusk-survey.clear"));
		} else {
			BlockPos spot = nearest == null ? origin : nearest;
			int blocks = (int) Math.round(Math.sqrt(spot.distSqr(origin)));
			serverPlayer.sendSystemMessage(Component.translatable(
					"message.dusk-survey.report",
					count,
					blocks,
					direction(origin, spot),
					Component.translatable(feet ? "message.dusk-survey.feet_unsafe" : "message.dusk-survey.feet_safe")
			));
		}
		if (DuskSurvey.CONFIG.showParticles) {
			for (BlockPos mark : marks) {
				level.sendParticles(ParticleTypes.SMOKE, mark.getX() + 0.5, mark.getY() + 0.2, mark.getZ() + 0.5, 2, 0.15, 0.05, 0.15, 0.0);
			}
		}
		if (DuskSurvey.CONFIG.cooldownTicks > 0) {
			serverPlayer.getCooldowns().addCooldown(stack, DuskSurvey.CONFIG.cooldownTicks);
		}
		if (!serverPlayer.getAbilities().instabuild && DuskSurvey.CONFIG.durability > 0) {
			stack.hurtAndBreak(DuskSurvey.CONFIG.durability, serverPlayer, hand == InteractionHand.MAIN_HAND ? EquipmentSlot.MAINHAND : EquipmentSlot.OFFHAND);
		}
		return InteractionResult.SUCCESS;
	}

	private static void replaceFarthest(List<BlockPos> marks, BlockPos origin, BlockPos.MutableBlockPos cursor) {
		int farthest = 0;
		double farthestDistance = -1;
		for (int index = 0; index < marks.size(); index++) {
			double distance = marks.get(index).distSqr(origin);
			if (distance > farthestDistance) {
				farthestDistance = distance;
				farthest = index;
			}
		}
		if (cursor.distSqr(origin) < farthestDistance) {
			marks.set(farthest, cursor.immutable());
		}
	}

	/**
	 * A zombie-sized mob needs a legal floor and feet-level block light at or under the cap.
	 * Sky light is ignored, so the survey still means something at noon.
	 */
	private static boolean spawnable(ServerLevel level, BlockPos pos) {
		if (!level.isLoaded(pos)) {
			return false;
		}
		if (level.getBrightness(LightLayer.BLOCK, pos) > DuskSurvey.CONFIG.maxBlockLight) {
			return false;
		}
		return SpawnPlacements.isSpawnPositionOk(EntityTypes.ZOMBIE, level, pos);
	}

	private static Component direction(BlockPos from, BlockPos to) {
		int dx = to.getX() - from.getX();
		int dz = to.getZ() - from.getZ();
		int dy = to.getY() - from.getY();
		if (dx == 0 && dz == 0) {
			if (dy > 0) {
				return Component.translatable("message.dusk-survey.direction.up");
			}
			if (dy < 0) {
				return Component.translatable("message.dusk-survey.direction.down");
			}
			return Component.translatable("message.dusk-survey.direction.here");
		}
		String east = dx > 0 ? "east" : "west";
		String south = dz > 0 ? "south" : "north";
		int ax = Math.abs(dx);
		int az = Math.abs(dz);
		String key;
		if (dx == 0) {
			key = south;
		} else if (dz == 0) {
			key = east;
		} else if (ax > az * 1.8) {
			key = east;
		} else if (az > ax * 1.8) {
			key = south;
		} else {
			key = south + east;
		}
		return Component.translatable("message.dusk-survey.direction." + key);
	}
}
