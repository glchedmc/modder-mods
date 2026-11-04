package mc.glched.swapbaton;

import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

public final class SwapBatonItem extends Item {
	public SwapBatonItem(Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResult useOn(UseOnContext context) {
		Player player = context.getPlayer();
		if (player == null) {
			return InteractionResult.FAIL;
		}
		if (context.getLevel().isClientSide()) {
			return InteractionResult.SUCCESS;
		}
		if (!(player instanceof ServerPlayer serverPlayer) || !(context.getLevel() instanceof ServerLevel level)) {
			return InteractionResult.FAIL;
		}
		ItemStack baton = context.getItemInHand();
		if (player.getCooldowns().isOnCooldown(baton)) {
			return InteractionResult.FAIL;
		}
		BlockPos pos = context.getClickedPos();
		double reach = SwapBaton.CONFIG.reach;
		if (player.getEyePosition().distanceToSqr(Vec3.atCenterOf(pos)) > reach * reach) {
			return InteractionResult.FAIL;
		}
		if (!player.mayBuild() || !level.mayInteract(serverPlayer, pos)) {
			return InteractionResult.FAIL;
		}
		BlockState state = level.getBlockState(pos);
		if (!SwapRules.canTake(level, pos, state)) {
			player.sendSystemMessage(Component.translatable("message.swap-baton.refused"));
			return InteractionResult.FAIL;
		}
		InteractionHand otherHand = context.getHand() == InteractionHand.MAIN_HAND ? InteractionHand.OFF_HAND : InteractionHand.MAIN_HAND;
		ItemStack other = player.getItemInHand(otherHand);
		if (!(other.getItem() instanceof BlockItem blockItem)) {
			player.sendSystemMessage(Component.translatable("message.swap-baton.need_block"));
			return InteractionResult.FAIL;
		}
		if (blockItem.getBlock() == state.getBlock()) {
			player.sendSystemMessage(Component.translatable("message.swap-baton.same"));
			return InteractionResult.FAIL;
		}
		BlockState placed = SwapRules.placedState(state, blockItem.getBlock().defaultBlockState());
		if (!placed.canSurvive(level, pos)) {
			player.sendSystemMessage(Component.translatable("message.swap-baton.unsteady"));
			return InteractionResult.FAIL;
		}
		if (!player.getAbilities().instabuild) {
			other.shrink(1);
		}
		level.setBlockAndUpdate(pos, placed);
		if (!player.getAbilities().instabuild) {
			ItemStack give = new ItemStack(state.getBlock());
			if (!player.getInventory().add(give) && !give.isEmpty()) {
				net.minecraft.world.level.block.Block.popResource(level, pos, give);
			}
		}
		if (SwapBaton.CONFIG.cooldownTicks > 0) {
			player.getCooldowns().addCooldown(baton, SwapBaton.CONFIG.cooldownTicks);
		}
		if (!player.getAbilities().instabuild && SwapBaton.CONFIG.durability > 0) {
			baton.hurtAndBreak(SwapBaton.CONFIG.durability, serverPlayer, context.getHand() == InteractionHand.MAIN_HAND ? EquipmentSlot.MAINHAND : EquipmentSlot.OFFHAND);
		}
		level.playSound(null, pos, SoundEvents.COPPER_PLACE, SoundSource.BLOCKS, 0.8F, 1.0F);
		player.sendSystemMessage(Component.translatable("message.swap-baton.swapped", placed.getBlock().getName()));
		return InteractionResult.SUCCESS;
	}
}
