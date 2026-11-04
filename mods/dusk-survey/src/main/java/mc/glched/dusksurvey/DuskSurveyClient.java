package mc.glched.dusksurvey;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;

public final class DuskSurveyClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		ItemTooltipCallback.EVENT.register((stack, context, type, lines) -> {
			if (stack.is(DuskSurveyItems.DUSK_SURVEY)) {
				lines.add(Component.translatable("tooltip.dusk-survey.hint").withStyle(ChatFormatting.GRAY));
			}
		});
	}
}
