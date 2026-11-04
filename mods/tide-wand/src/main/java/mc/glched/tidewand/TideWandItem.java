package mc.glched.tidewand;

import net.minecraft.network.protocol.game.ClientboundSetEntityMotionPacket;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.SwingAnimation;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

public final class TideWandItem extends Item {
	public TideWandItem(Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		ItemStack stack = player.getItemInHand(hand);
		if (level.isClientSide()) {
			return InteractionResult.SUCCESS;
		}
		if (player.isPassenger() || player.getCooldowns().isOnCooldown(stack)) {
			return InteractionResult.FAIL;
		}
		if (player.isShiftKeyDown()) {
			return openWell((ServerLevel) level, player, hand, stack);
		}
		return launch(level, player, hand, stack);
	}

	private static InteractionResult launch(Level level, Player player, InteractionHand hand, ItemStack stack) {
		Vec3 look = Entity.calculateViewVector(player.getXRot(), player.getYRot());
		Vec3 velocity = look.scale(TideWand.CONFIG.launchSpeed).add(0.0, TideWand.CONFIG.launchLift, 0.0);
		player.setDeltaMovement(velocity);
		player.syncVelocity = true;
		if (player instanceof ServerPlayer serverPlayer) {
			serverPlayer.connection.send(new ClientboundSetEntityMotionPacket(serverPlayer));
		}
		player.resetFallDistance();
		player.getCooldowns().addCooldown(stack, TideWand.CONFIG.launchCooldown);
		stack.hurtAndBreak(TideWand.CONFIG.launchDurability, player, handSlot(hand));
		level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.WIND_CHARGE_THROW, SoundSource.PLAYERS, 0.7F, 1.2F);
		player.swing(hand, SwingAnimation.DEFAULT, true);
		return InteractionResult.SUCCESS;
	}

	private static InteractionResult openWell(ServerLevel level, Player player, InteractionHand hand, ItemStack stack) {
		BlockHitResult hit = Item.getPlayerPOVHitResult(level, player, net.minecraft.world.level.ClipContext.Fluid.NONE);
		if (hit.getType() != HitResult.Type.BLOCK) {
			return InteractionResult.FAIL;
		}
		Vec3 center = Vec3.atCenterOf(hit.getBlockPos()).add(0.0, 0.6, 0.0);
		TideWells.spawn(level, center);
		player.getCooldowns().addCooldown(stack, TideWand.CONFIG.wellCooldown);
		stack.hurtAndBreak(TideWand.CONFIG.wellDurability, player, handSlot(hand));
		level.playSound(null, center.x, center.y, center.z, SoundEvents.BEACON_ACTIVATE, SoundSource.PLAYERS, 0.6F, 1.4F);
		player.swing(hand, SwingAnimation.DEFAULT, true);
		return InteractionResult.SUCCESS;
	}

	private static EquipmentSlot handSlot(InteractionHand hand) {
		return hand == InteractionHand.MAIN_HAND ? EquipmentSlot.MAINHAND : EquipmentSlot.OFFHAND;
	}
}
