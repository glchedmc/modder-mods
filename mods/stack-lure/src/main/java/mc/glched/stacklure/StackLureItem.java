package mc.glched.stacklure;

import net.minecraft.network.chat.Component;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.world.level.Level;
import net.minecraft.core.component.DataComponents;

public final class StackLureItem extends Item {
	public StackLureItem(Properties properties) {
		super(properties);
	}

	public static boolean isQuiet(ItemStack stack) {
		CustomData data = stack.getOrDefault(DataComponents.CUSTOM_DATA, CustomData.EMPTY);
		return data.copyTag().getBooleanOr("off", false);
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		ItemStack stack = player.getItemInHand(hand);
		if (level.isClientSide()) {
			return InteractionResult.SUCCESS;
		}
		boolean quiet = !isQuiet(stack);
		CustomData.update(DataComponents.CUSTOM_DATA, stack, tag -> tag.putBoolean("off", quiet));
		player.sendSystemMessage(Component.translatable(quiet ? "message.stack-lure.off" : "message.stack-lure.on"));
		return InteractionResult.SUCCESS;
	}
}
