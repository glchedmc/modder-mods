package mc.glched.glasscompanion;

import java.util.ArrayList;
import java.util.List;

import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;

/**
 * Shortens item tooltips: removes blank spacer lines, optionally the
 * "When in Main Hand" attribute block, and caps the line count. Holding Shift
 * shows the full vanilla tooltip.
 */
public final class TooltipCompactor {
	private TooltipCompactor() {
	}

	static void compact(ItemStack stack, Item.TooltipContext context, TooltipFlag flag, List<Component> lines) {
		if (!CompanionConfig.bool("compactTooltips") || lines.size() <= 1) {
			return;
		}
		if (Minecraft.getInstance().hasShiftDown()) {
			return;
		}
		List<Component> out = new ArrayList<>(lines.size());
		boolean skippingAttributes = false;
		for (int i = 0; i < lines.size(); i++) {
			Component line = lines.get(i);
			String text = line.getString();
			if (i == 0) {
				out.add(line);
				continue;
			}
			if (text.isBlank()) {
				skippingAttributes = false;
				continue;
			}
			if (CompanionConfig.bool("hideAttributeLines")) {
				if (isAttributeHeader(line)) {
					skippingAttributes = true;
					continue;
				}
				if (skippingAttributes && text.startsWith(" ")) {
					continue;
				}
				skippingAttributes = false;
			}
			out.add(line);
		}
		int max = Math.max(2, (int) CompanionConfig.num("tooltipMaxLines"));
		if (out.size() > max) {
			int hidden = out.size() - (max - 1);
			out = new ArrayList<>(out.subList(0, max - 1));
			out.add(Component.literal("+" + hidden + " more (hold Shift)").withStyle(ChatFormatting.DARK_GRAY, ChatFormatting.ITALIC));
		}
		lines.clear();
		lines.addAll(out);
	}

	private static boolean isAttributeHeader(Component line) {
		if (line.getContents() instanceof net.minecraft.network.chat.contents.TranslatableContents tc) {
			return tc.getKey().startsWith("item.modifiers.");
		}
		return false;
	}
}
