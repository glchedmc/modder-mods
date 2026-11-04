package mc.glched.milespool;

import net.minecraft.core.BlockPos;
import net.minecraft.core.component.DataComponents;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.world.level.Level;

public final class MileSpoolItem extends Item {
	public MileSpoolItem(Properties properties) {
		super(properties);
	}

	public static boolean hasMark(ItemStack stack) {
		CompoundTag tag = stack.getOrDefault(DataComponents.CUSTOM_DATA, CustomData.EMPTY).copyTag();
		return tag.contains("dim");
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		ItemStack stack = player.getItemInHand(hand);
		if (level.isClientSide()) {
			return InteractionResult.SUCCESS;
		}
		if (!(player instanceof ServerPlayer serverPlayer)) {
			return InteractionResult.FAIL;
		}
		if (player.isShiftKeyDown()) {
			if (!hasMark(stack)) {
				player.sendSystemMessage(Component.translatable("message.mile-spool.none"));
				return InteractionResult.FAIL;
			}
			stack.remove(DataComponents.CUSTOM_DATA);
			player.sendSystemMessage(Component.translatable("message.mile-spool.cleared"));
			return InteractionResult.SUCCESS;
		}
		BlockPos pos = serverPlayer.blockPosition();
		String dimension = serverPlayer.level().dimension().identifier().toString();
		CustomData.update(DataComponents.CUSTOM_DATA, stack, tag -> {
			tag.putString("dim", dimension);
			tag.putInt("x", pos.getX());
			tag.putInt("y", pos.getY());
			tag.putInt("z", pos.getZ());
		});
		if (!player.getAbilities().instabuild && MileSpool.CONFIG.markDurability > 0) {
			stack.hurtAndBreak(MileSpool.CONFIG.markDurability, player, hand == InteractionHand.MAIN_HAND ? EquipmentSlot.MAINHAND : EquipmentSlot.OFFHAND);
		}
		player.sendSystemMessage(Component.translatable("message.mile-spool.marked", pos.getX(), pos.getY(), pos.getZ(), dimension));
		return InteractionResult.SUCCESS;
	}
}
