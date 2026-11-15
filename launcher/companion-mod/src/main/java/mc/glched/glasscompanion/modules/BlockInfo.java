package mc.glched.glasscompanion.modules;

import java.util.Locale;

import mc.glched.glasscompanion.CompanionConfig;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

/**
 * WAILA-style card for the block under the crosshair (from Block Brief and
 * Sight Line): icon, name, position and distance, and the tool it needs.
 */
public final class BlockInfo {
	public record Card(ItemStack icon, String name, String line2, String line3, int line3Color) {
	}

	private BlockInfo() {
	}

	public static Card current(Minecraft mc, boolean sample) {
		Level level = mc.level;
		Entity camera = mc.getCameraEntity();
		if (level == null || camera == null) {
			return sample ? sampleCard() : null;
		}
		BlockHitResult hit = null;
		if (mc.hitResult instanceof BlockHitResult b && b.getType() == HitResult.Type.BLOCK) {
			hit = b;
		} else if (CompanionConfig.bool("blockInfoFar")) {
			double range = Math.min(mc.options.getEffectiveRenderDistance(), 32) * 16.0;
			Vec3 start = camera.getEyePosition();
			BlockHitResult far = level.clip(new ClipContext(start, start.add(camera.getLookAngle().scale(range)), ClipContext.Block.OUTLINE, ClipContext.Fluid.NONE, camera));
			if (far.getType() == HitResult.Type.BLOCK) {
				hit = far;
			}
		}
		if (hit == null) {
			return sample ? sampleCard() : null;
		}
		BlockPos pos = hit.getBlockPos();
		BlockState state = level.getBlockState(pos);
		if (state.isAir()) {
			return sample ? sampleCard() : null;
		}
		ItemStack icon = new ItemStack(state.getBlock().asItem());
		if (icon.isEmpty()) {
			icon = new ItemStack(Items.BARRIER);
		}
		double dist = camera.getEyePosition().distanceTo(hit.getLocation());
		String line2 = String.format(Locale.ROOT, "%d %d %d · %.1f m", pos.getX(), pos.getY(), pos.getZ(), dist);
		float hardness = state.getDestroySpeed(level, pos);
		String tool = tool(state);
		String line3;
		int color;
		if (hardness < 0) {
			line3 = "Unbreakable";
			color = 0xFFFF8A8A;
		} else {
			line3 = (tool == null ? "Any tool" : tool) + (state.requiresCorrectToolForDrops() ? " needed" : "") + String.format(Locale.ROOT, " · hardness %.1f", hardness);
			color = state.requiresCorrectToolForDrops() ? 0xFFFFD36B : 0xFF9BE8B4;
		}
		return new Card(icon, state.getBlock().getName().getString(), line2, line3, color);
	}

	private static String tool(BlockState state) {
		if (state.is(BlockTags.MINEABLE_WITH_PICKAXE)) {
			return "Pickaxe";
		}
		if (state.is(BlockTags.MINEABLE_WITH_AXE)) {
			return "Axe";
		}
		if (state.is(BlockTags.MINEABLE_WITH_SHOVEL)) {
			return "Shovel";
		}
		if (state.is(BlockTags.MINEABLE_WITH_HOE)) {
			return "Hoe";
		}
		return null;
	}

	private static Card sampleCard() {
		return new Card(new ItemStack(Items.DIAMOND_ORE), "Diamond Ore", "-112 11 340 · 3.2 m", "Pickaxe needed · hardness 3.0", 0xFFFFD36B);
	}
}
