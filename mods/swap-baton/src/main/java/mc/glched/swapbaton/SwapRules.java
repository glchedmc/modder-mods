package mc.glched.swapbaton;

import net.minecraft.core.BlockPos;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.InfestedBlock;
import net.minecraft.world.level.block.InfestedRotatedPillarBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraft.world.level.Level;

public final class SwapRules {
	private SwapRules() {
	}

	/**
	 * Full cubes with a matching item only. Ores, unbreakable blocks, and anything with
	 * an inventory stay put so the baton cannot turn a vein into a silk-touch harvest.
	 */
	public static boolean canTake(Level level, BlockPos pos, BlockState state) {
		if (state.isAir() || state.hasBlockEntity() || !state.getFluidState().isEmpty()) {
			return false;
		}
		if (state.getDestroySpeed(level, pos) < 0.0F) {
			return false;
		}
		if (!state.isCollisionShapeFullBlock(level, pos)) {
			return false;
		}
		if (state.is(BlockTags.ORES) || state.is(Blocks.ANCIENT_DEBRIS) || state.is(Blocks.BUDDING_AMETHYST) || state.is(Blocks.REINFORCED_DEEPSLATE)) {
			return false;
		}
		if (state.getBlock() instanceof InfestedBlock || state.getBlock() instanceof InfestedRotatedPillarBlock) {
			return false;
		}
		Item item = state.getBlock().asItem();
		if (item == Items.AIR || !(item instanceof BlockItem blockItem)) {
			return false;
		}
		return blockItem.getBlock() == state.getBlock();
	}

	public static BlockState placedState(BlockState from, BlockState to) {
		for (Property<?> property : from.getProperties()) {
			if (to.hasProperty(property)) {
				to = copyProperty(to, from, property);
			}
		}
		return to;
	}

	private static <T extends Comparable<T>> BlockState copyProperty(BlockState to, BlockState from, Property<T> property) {
		return to.setValue(property, from.getValue(property));
	}
}
