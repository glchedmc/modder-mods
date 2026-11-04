package mc.glched.milespool;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.core.component.DataComponents;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.component.CustomData;

public final class MileSpoolClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		ItemTooltipCallback.EVENT.register((stack, context, type, lines) -> {
			if (!stack.is(MileSpoolItems.MILE_SPOOL)) {
				return;
			}
			lines.add(Component.translatable("tooltip.mile-spool.hint").withStyle(ChatFormatting.GRAY));
			if (!MileSpoolItem.hasMark(stack)) {
				return;
			}
			CompoundTag tag = stack.getOrDefault(DataComponents.CUSTOM_DATA, CustomData.EMPTY).copyTag();
			lines.add(Component.translatable(
					"tooltip.mile-spool.mark",
					tag.getIntOr("x", 0),
					tag.getIntOr("y", 0),
					tag.getIntOr("z", 0),
					tag.getStringOr("dim", "")
			).withStyle(ChatFormatting.DARK_AQUA));
		});
	}
}
