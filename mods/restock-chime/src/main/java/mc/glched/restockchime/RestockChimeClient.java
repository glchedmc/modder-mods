package mc.glched.restockchime;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;

public final class RestockChimeClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		ItemTooltipCallback.EVENT.register((stack, context, type, lines) -> {
			if (stack.is(RestockChimeItems.RESTOCK_CHIME)) {
				lines.add(Component.translatable("tooltip.restock-chime.hint").withStyle(ChatFormatting.GRAY));
			}
		});
	}
}
