package mc.glched.glasscompanion.modules;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import mc.glched.glasscompanion.CompanionConfig;
import mc.glched.glasscompanion.Glass;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.inventory.tooltip.ClientTooltipComponent;
import net.minecraft.core.NonNullList;
import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.contents.TranslatableContents;
import net.minecraft.world.inventory.tooltip.TooltipComponent;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.ItemContainerContents;
import net.minecraft.world.level.block.ShulkerBoxBlock;

/**
 * Lunar's Shulker Preview: hovering a shulker box shows its 27 slots as a
 * grid in the tooltip, tinted by the box color, instead of the text list.
 */
public final class ShulkerPreview {
	public record Data(List<ItemStack> items, int tint) implements TooltipComponent {
	}

	private ShulkerPreview() {
	}

	/** Called from ItemStack.getTooltipImage. */
	public static Optional<TooltipComponent> image(ItemStack stack) {
		if (!CompanionConfig.module("shulkerPreview") || !(stack.getItem() instanceof BlockItem bi) || !(bi.getBlock() instanceof ShulkerBoxBlock box)) {
			return Optional.empty();
		}
		ItemContainerContents contents = stack.get(DataComponents.CONTAINER);
		if (contents == null || contents.nonEmptyItemCopyStream().findAny().isEmpty()) {
			return Optional.empty();
		}
		NonNullList<ItemStack> slots = NonNullList.withSize(27, ItemStack.EMPTY);
		contents.copyInto(slots);
		DyeColor color = box.getColor();
		int tint = color == null || !CompanionConfig.bool("shulkerPreviewColor") ? 0x9F7BB0 : color.getTextureDiffuseColor() & 0xFFFFFF;
		return Optional.of(new Data(new ArrayList<>(slots), tint));
	}

	/** Drops vanilla's "Item x3 / and N more" lines when the grid is shown. */
	public static void filterLines(ItemStack stack, List<Component> lines) {
		if (image(stack).isEmpty()) {
			return;
		}
		lines.removeIf(line -> line.getContents() instanceof TranslatableContents tc && tc.getKey().startsWith("item.container."));
	}

	public static final class Client implements ClientTooltipComponent {
		private final Data data;

		public Client(Data data) {
			this.data = data;
		}

		@Override
		public int getHeight(Font font) {
			return 3 * 18 + 8;
		}

		@Override
		public int getWidth(Font font) {
			return 9 * 18 + 4;
		}

		@Override
		public void extractImage(Font font, int x, int y, int w, int h, GuiGraphicsExtractor g) {
			int bg = Glass.mix(0x1A1E44, data.tint(), 0.35f) & 0xFFFFFF;
			Glass.rounded(g, x, y + 2, x + 9 * 18 + 4, y + 2 + 3 * 18 + 4, 4, 0xE0000000 | bg);
			for (int i = 0; i < 27; i++) {
				int sx = x + 2 + (i % 9) * 18;
				int sy = y + 4 + (i / 9) * 18;
				g.fill(sx + 1, sy + 1, sx + 17, sy + 17, 0x26FFFFFF);
				ItemStack s = i < data.items().size() ? data.items().get(i) : ItemStack.EMPTY;
				if (!s.isEmpty()) {
					g.item(s, sx + 1, sy + 1);
					g.itemDecorations(font, s, sx + 1, sy + 1);
				}
			}
		}
	}
}
