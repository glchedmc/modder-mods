package mc.glched.kilntally;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;

public final class KilnTallyClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		ItemTooltipCallback.EVENT.register((stack, context, type, lines) -> {
			if (stack.is(KilnTallyItems.KILN_TALLY)) {
				lines.add(Component.translatable("tooltip.kiln-tally.hint").withStyle(ChatFormatting.GRAY));
			}
		});
	}
}
