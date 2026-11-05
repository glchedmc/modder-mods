package mc.glched.tidewand;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;

public final class TideWandClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		ItemTooltipCallback.EVENT.register((stack, context, type, lines) -> {
			if (stack.is(TideWandItems.TIDE_WAND)) {
				lines.add(Component.translatable("tooltip.tide-wand.hint").withStyle(ChatFormatting.GRAY));
			}
		});
	}
}
