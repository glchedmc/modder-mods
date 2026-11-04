package mc.glched.salvagehook;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;

public final class SalvageHookClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		ItemTooltipCallback.EVENT.register((stack, context, type, lines) -> {
			if (stack.is(SalvageHookItems.SALVAGE_HOOK)) {
				lines.add(Component.translatable("tooltip.salvage-hook.hint").withStyle(ChatFormatting.GRAY));
			}
		});
	}
}
