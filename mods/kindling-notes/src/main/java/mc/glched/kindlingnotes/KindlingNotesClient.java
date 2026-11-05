package mc.glched.kindlingnotes;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.ItemStack;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class KindlingNotesClient implements ClientModInitializer {
	public static final String MOD_ID = "kindling-notes";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);
	public static KindlingNotesConfig CONFIG = new KindlingNotesConfig();

	@Override
	public void onInitializeClient() {
		CONFIG = KindlingNotesConfig.load();
		ItemTooltipCallback.EVENT.register((stack, context, type, lines) -> annotate(stack, lines));
		LOGGER.info("[kindling-notes] ready");
	}

	private static void annotate(ItemStack stack, java.util.List<Component> lines) {
		KindlingNotesConfig config = CONFIG;
		if (config.showFood && stack.has(DataComponents.FOOD)) {
			FoodProperties food = stack.get(DataComponents.FOOD);
			if (food != null) {
				lines.add(Component.translatable("tooltip.kindling-notes.food", food.nutrition(), trim(food.saturation()))
						.withStyle(ChatFormatting.GOLD));
			}
		}
		if (config.showFuel && stack.has(DataComponents.COOKING_FUEL)) {
			lines.add(Component.translatable("tooltip.kindling-notes.fuel").withStyle(ChatFormatting.GRAY));
		}
		if (config.showCompost && stack.has(DataComponents.COMPOSTABLE)) {
			lines.add(Component.translatable("tooltip.kindling-notes.compost").withStyle(ChatFormatting.DARK_GREEN));
		}
		if (config.showRepair && stack.has(DataComponents.REPAIRABLE)) {
			lines.add(Component.translatable("tooltip.kindling-notes.repair").withStyle(ChatFormatting.BLUE));
		}
		if (config.showDurability && stack.isDamageableItem() && stack.getMaxDamage() > 0) {
			int left = stack.getMaxDamage() - stack.getDamageValue();
			lines.add(Component.translatable("tooltip.kindling-notes.wear", left, stack.getMaxDamage()).withStyle(ChatFormatting.DARK_GRAY));
		}
	}

	private static String trim(float value) {
		return String.format(java.util.Locale.ROOT, "%.2f", value);
	}
}
