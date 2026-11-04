package mc.glched.motecharm;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;

public final class MoteCharmClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		ItemTooltipCallback.EVENT.register((stack, context, type, lines) -> {
			if (stack.is(MoteCharmItems.MOTE_CHARM)) {
				lines.add(Component.translatable("tooltip.mote-charm.hint").withStyle(ChatFormatting.GRAY));
			}
		});
	}
}
