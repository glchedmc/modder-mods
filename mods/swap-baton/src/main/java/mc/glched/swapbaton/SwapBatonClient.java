package mc.glched.swapbaton;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;

public final class SwapBatonClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		ItemTooltipCallback.EVENT.register((stack, context, type, lines) -> {
			if (stack.is(SwapBatonItems.SWAP_BATON)) {
				lines.add(Component.translatable("tooltip.swap-baton.hint").withStyle(ChatFormatting.GRAY));
			}
		});
	}
}
