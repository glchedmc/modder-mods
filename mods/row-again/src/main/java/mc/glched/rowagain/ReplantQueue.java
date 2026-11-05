package mc.glched.rowagain;

import java.util.ArrayList;
import java.util.List;

import net.minecraft.core.BlockPos;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.level.entity.EntityTypeTest;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CocoaBlock;
import net.minecraft.world.level.block.CropBlock;
import net.minecraft.world.level.block.NetherWartBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;

import org.jspecify.annotations.Nullable;

public final class ReplantQueue {
	private static final List<Job> PENDING = new ArrayList<>();

	private ReplantQueue() {
	}

	public static void onBreak(Level level, Player player, BlockPos pos, BlockState state, @Nullable BlockEntity blockEntity) {
		if (!RowAgain.CONFIG.enabled || level.isClientSide() || !(level instanceof ServerLevel serverLevel)) {
			return;
		}
		if (RowAgain.CONFIG.sneakSkips && player.isShiftKeyDown()) {
			return;
		}
		if (!isMature(state)) {
			return;
		}
		Item seed = seedFor(state.getBlock());
		if (seed == null) {
			return;
		}
		PENDING.add(new Job(serverLevel, pos.immutable(), state, player.getUUID(), seed));
	}

	public static void tick(MinecraftServer server) {
		if (PENDING.isEmpty()) {
			return;
		}
		List<Job> jobs = List.copyOf(PENDING);
		PENDING.clear();
		for (Job job : jobs) {
			replant(server, job);
		}
	}

	private static void replant(MinecraftServer server, Job job) {
		ServerPlayer player = server.getPlayerList().getPlayer(job.playerId());
		if (player == null || job.level() != player.level()) {
			return;
		}
		if (!job.level().getBlockState(job.pos()).isAir()) {
			return;
		}
		BlockState planted = plantedState(job.broken());
		if (!planted.canSurvive(job.level(), job.pos())) {
			return;
		}
		if (!consumeSeed(job.level(), player, job.pos(), job.seed())) {
			return;
		}
		job.level().setBlockAndUpdate(job.pos(), planted);
		job.level().playSound(null, job.pos(), SoundEvents.CROP_PLANTED, SoundSource.BLOCKS, 0.7F, 1.0F);
	}

	private static boolean isMature(BlockState state) {
		Block block = state.getBlock();
		if (block instanceof CropBlock crop) {
			return crop.isMaxAge(state);
		}
		if (block instanceof NetherWartBlock) {
			return state.getValue(NetherWartBlock.AGE) >= 3;
		}
		if (block instanceof CocoaBlock) {
			return state.getValue(CocoaBlock.AGE) >= 2;
		}
		return false;
	}

	private static @Nullable Item seedFor(Block block) {
		if (block == Blocks.WHEAT) {
			return Items.WHEAT_SEEDS;
		}
		if (block == Blocks.CARROTS) {
			return Items.CARROT;
		}
		if (block == Blocks.POTATOES) {
			return Items.POTATO;
		}
		if (block == Blocks.BEETROOTS) {
			return Items.BEETROOT_SEEDS;
		}
		if (block == Blocks.TORCHFLOWER_CROP) {
			return Items.TORCHFLOWER_SEEDS;
		}
		if (block == Blocks.NETHER_WART) {
			return Items.NETHER_WART;
		}
		if (block == Blocks.COCOA) {
			return Items.COCOA_BEANS;
		}
		return null;
	}

	private static BlockState plantedState(BlockState broken) {
		if (broken.getBlock() instanceof CocoaBlock) {
			return broken.setValue(CocoaBlock.AGE, 0);
		}
		return broken.getBlock().defaultBlockState();
	}

	private static boolean consumeSeed(ServerLevel level, ServerPlayer player, BlockPos pos, Item seed) {
		AABB area = new AABB(pos).inflate(1.5);
		List<ItemEntity> drops = level.getEntities(EntityTypeTest.forClass(ItemEntity.class), area, entity -> entity.getItem().is(seed));
		for (ItemEntity drop : drops) {
			ItemStack stack = drop.getItem();
			stack.shrink(1);
			if (stack.isEmpty()) {
				drop.discard();
			} else {
				drop.setItem(stack);
			}
			return true;
		}
		var inventory = player.getInventory();
		int size = Math.min(36, inventory.getContainerSize());
		for (int slot = 0; slot < size; slot++) {
			ItemStack stack = inventory.getItem(slot);
			if (stack.is(seed)) {
				stack.shrink(1);
				if (stack.isEmpty()) {
					inventory.setItem(slot, ItemStack.EMPTY);
				}
				return true;
			}
		}
		return false;
	}

	private record Job(ServerLevel level, BlockPos pos, BlockState broken, java.util.UUID playerId, Item seed) {
	}
}
