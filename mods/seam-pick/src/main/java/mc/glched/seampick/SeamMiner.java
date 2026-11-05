package mc.glched.seampick;

import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.Set;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

import org.jspecify.annotations.Nullable;

public final class SeamMiner {
	private static final ThreadLocal<Boolean> BUSY = ThreadLocal.withInitial(() -> false);

	private SeamMiner() {
	}

	public static void afterBreak(Level level, Player player, BlockPos pos, BlockState state, @Nullable BlockEntity blockEntity) {
		if (BUSY.get() || level.isClientSide() || !(player instanceof ServerPlayer serverPlayer)) {
			return;
		}
		if (player.isShiftKeyDown() || !player.mayBuild()) {
			return;
		}
		ItemStack stack = player.getMainHandItem();
		if (!(stack.getItem() instanceof SeamPickItem)) {
			return;
		}
		if (state.hasBlockEntity() || state.is(Blocks.BUDDING_AMETHYST) || state.is(Blocks.REINFORCED_DEEPSLATE)) {
			return;
		}
		if (!state.is(BlockTags.MINEABLE_WITH_PICKAXE) || !player.hasCorrectToolForDrops(state)) {
			return;
		}
		if (!player.getAbilities().instabuild && player.getFoodData().getFoodLevel() < SeamPick.CONFIG.minFood) {
			player.sendSystemMessage(Component.translatable("message.seam-pick.hungry"));
			return;
		}

		BUSY.set(true);
		try {
			mineSeam((ServerLevel) level, serverPlayer, stack, pos, state);
		} finally {
			BUSY.set(false);
		}
	}

	private static void mineSeam(ServerLevel level, ServerPlayer player, ItemStack stack, BlockPos origin, BlockState originState) {
		ArrayDeque<BlockPos> queue = new ArrayDeque<>();
		Set<BlockPos> seen = new HashSet<>();
		queue.add(origin);
		seen.add(origin);
		int broken = 0;
		while (!queue.isEmpty() && broken < SeamPick.CONFIG.maxExtraBlocks) {
			BlockPos current = queue.removeFirst();
			for (Direction direction : Direction.values()) {
				if (broken >= SeamPick.CONFIG.maxExtraBlocks || stack.isEmpty()) {
					return;
				}
				BlockPos next = current.relative(direction);
				if (!seen.add(next) || manhattan(next, origin) > SeamPick.CONFIG.maxDistance) {
					continue;
				}
				BlockState nextState = level.getBlockState(next);
				if (nextState.getBlock() != originState.getBlock() || nextState.hasBlockEntity()) {
					continue;
				}
				if (!nextState.is(BlockTags.MINEABLE_WITH_PICKAXE) || !player.hasCorrectToolForDrops(nextState)) {
					continue;
				}
				if (!canPay(player, stack)) {
					player.sendSystemMessage(Component.translatable("message.seam-pick.hungry"));
					return;
				}
				if (!level.destroyBlock(next, true, player, 512)) {
					continue;
				}
				pay(player, stack);
				broken++;
				queue.add(next);
			}
		}
	}

	private static boolean canPay(ServerPlayer player, ItemStack stack) {
		if (player.getAbilities().instabuild) {
			return true;
		}
		if (player.getFoodData().getFoodLevel() < SeamPick.CONFIG.minFood) {
			return false;
		}
		int remaining = stack.getMaxDamage() - stack.getDamageValue();
		return remaining > SeamPick.CONFIG.extraDurability;
	}

	private static int manhattan(BlockPos left, BlockPos right) {
		return Math.abs(left.getX() - right.getX()) + Math.abs(left.getY() - right.getY()) + Math.abs(left.getZ() - right.getZ());
	}

	private static void pay(ServerPlayer player, ItemStack stack) {
		if (player.getAbilities().instabuild) {
			return;
		}
		player.causeFoodExhaustion(SeamPick.CONFIG.exhaustion);
		stack.hurtAndBreak(SeamPick.CONFIG.extraDurability, player, EquipmentSlot.MAINHAND);
	}
}
