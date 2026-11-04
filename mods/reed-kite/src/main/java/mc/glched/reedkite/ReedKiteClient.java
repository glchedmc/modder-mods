package mc.glched.reedkite;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;

public final class ReedKiteClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		ItemTooltipCallback.EVENT.register((stack, context, type, lines) -> {
			if (stack.is(ReedKiteItems.REED_KITE)) {
				lines.add(Component.translatable("tooltip.reed-kite.hint").withStyle(ChatFormatting.GRAY));
			}
		});
	}
}
