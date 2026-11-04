package mc.glched.stacklure;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;

public final class StackLureClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		ItemTooltipCallback.EVENT.register((stack, context, type, lines) -> {
			if (!stack.is(StackLureItems.STACK_LURE)) {
				return;
			}
			lines.add(Component.translatable("tooltip.stack-lure.hint").withStyle(ChatFormatting.GRAY));
			if (StackLureItem.isQuiet(stack)) {
				lines.add(Component.translatable("tooltip.stack-lure.off").withStyle(ChatFormatting.DARK_GRAY));
			}
		});
	}
}
