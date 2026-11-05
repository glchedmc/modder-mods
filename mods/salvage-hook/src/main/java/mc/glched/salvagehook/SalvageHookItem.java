package mc.glched.salvagehook;

import java.util.List;

import net.minecraft.network.protocol.game.ClientboundSetEntityMotionPacket;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.SwingAnimation;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.entity.EntityTypeTest;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

public final class SalvageHookItem extends Item {
	public SalvageHookItem(Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		ItemStack stack = player.getItemInHand(hand);
		if (level.isClientSide()) {
			return InteractionResult.SUCCESS;
		}
		if (player.getCooldowns().isOnCooldown(stack)) {
			return InteractionResult.FAIL;
		}
		double range = SalvageHook.CONFIG.range;
		Vec3 from = player.getEyePosition();
		Vec3 look = Entity.calculateViewVector(player.getXRot(), player.getYRot());
		Vec3 to = from.add(look.scale(range));
		BlockHitResult hit = level.clip(new ClipContext(from, to, ClipContext.Block.OUTLINE, ClipContext.Fluid.NONE, player));
		if (hit.getType() != HitResult.Type.BLOCK) {
			return InteractionResult.FAIL;
		}
		Vec3 face = Vec3.atCenterOf(hit.getBlockPos()).add(
				hit.getDirection().getStepX() * 0.85,
				hit.getDirection().getStepY() * 0.85,
				hit.getDirection().getStepZ() * 0.85
		);
		Vec3 delta = face.subtract(player.position());
		double distance = delta.length();
		if (distance < 2.0) {
			return InteractionResult.FAIL;
		}
		double speed = Math.min(SalvageHook.CONFIG.maxSpeed, 0.35 + distance * 0.06);
		Vec3 velocity = delta.scale(speed / distance);
		player.setDeltaMovement(velocity);
		player.syncVelocity = true;
		if (player instanceof ServerPlayer serverPlayer) {
			serverPlayer.connection.send(new ClientboundSetEntityMotionPacket(serverPlayer));
		}
		if (velocity.y > 0.0) {
			player.resetFallDistance();
		}
		tugDrops((ServerLevel) level, player, from, face);
		player.getCooldowns().addCooldown(stack, SalvageHook.CONFIG.cooldownTicks);
		stack.hurtAndBreak(SalvageHook.CONFIG.durabilityCost, player, hand == InteractionHand.MAIN_HAND ? EquipmentSlot.MAINHAND : EquipmentSlot.OFFHAND);
		level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.FISHING_BOBBER_RETRIEVE, SoundSource.PLAYERS, 0.8F, 1.1F);
		player.swing(hand, SwingAnimation.DEFAULT, true);
		return InteractionResult.SUCCESS;
	}

	private static void tugDrops(ServerLevel level, Player player, Vec3 from, Vec3 to) {
		AABB box = new AABB(from, to).inflate(1.25);
		List<ItemEntity> items = level.getEntities(EntityTypeTest.forClass(ItemEntity.class), box, entity -> true);
		int pulled = 0;
		Vec3 gather = player.position().add(0.0, 0.8, 0.0);
		for (ItemEntity item : items) {
			if (pulled >= 16) {
				break;
			}
			Vec3 toward = gather.subtract(item.position());
			if (toward.lengthSqr() < 0.05) {
				continue;
			}
			item.setDeltaMovement(toward.normalize().scale(0.42));
			item.syncVelocity = true;
			pulled++;
		}
	}
}
