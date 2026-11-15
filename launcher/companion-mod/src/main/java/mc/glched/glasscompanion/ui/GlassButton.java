package mc.glched.glasscompanion.ui;

import java.util.function.Consumer;

import mc.glched.glasscompanion.Glass;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractButton;
import net.minecraft.client.gui.narration.NarrationElementOutput;
import net.minecraft.client.input.InputWithModifiers;
import net.minecraft.network.chat.Component;

/** A rounded glass button: plain, primary (accent fill) or danger. Optional small caption under the label. */
public class GlassButton extends AbstractButton {
	public enum Style { PLAIN, PRIMARY, DANGER, GHOST }

	private final Consumer<GlassButton> action;
	private final Style style;
	private final String caption;
	private final String glyph;

	public GlassButton(int x, int y, int w, int h, Component label, Style style, String glyph, String caption, Consumer<GlassButton> action) {
		super(x, y, w, h, label);
		this.style = style;
		this.glyph = glyph;
		this.caption = caption;
		this.action = action;
	}

	public GlassButton(int x, int y, int w, int h, String label, Style style, Consumer<GlassButton> action) {
		this(x, y, w, h, Component.literal(label), style, null, null, action);
	}

	@Override
	public void onPress(InputWithModifiers input) {
		action.accept(this);
	}

	@Override
	protected void extractContents(GuiGraphicsExtractor g, int mouseX, int mouseY, float partial) {
		Font font = Minecraft.getInstance().font;
		int x1 = getX(), y1 = getY(), x2 = x1 + width, y2 = y1 + height;
		boolean hot = isHoveredOrFocused() && active;
		switch (style) {
			case PRIMARY -> {
				int a = Glass.accent();
				Glass.rounded(g, x1, y1, x2, y2, 6, (hot ? 0xF8 : 0xE8) << 24 | (Glass.mix(a, 0xFFFFFF, hot ? 0.28f : 0.1f) & 0xFFFFFF));
				g.fill(x1 + 6, y1, x2 - 6, y1 + 1, 0x90FFFFFF);
				g.fillGradient(x1 + 4, y1 + 1, x2 - 4, y1 + height / 2, 0x40FFFFFF, 0x00FFFFFF);
			}
			case DANGER -> Glass.panel(g, x1, y1, x2, y2, hot ? 1f : 0.8f, hot ? 0x7A2236 : 0x3A1A2E, 6);
			case GHOST -> {
				if (hot) {
					Glass.rounded(g, x1, y1, x2, y2, 6, 0x40FFFFFF);
				}
			}
			default -> Glass.panel(g, x1, y1, x2, y2, hot ? 1f : 0.85f, hot ? 0x3A4596 : 0x252C62, 6);
		}
		int color = active ? 0xFFFFFFFF : 0x80FFFFFF;
		String text = getMessage().getString();
		int tx;
		int ty = caption == null ? y1 + (height - font.lineHeight) / 2 + 1 : y1 + height / 2 - font.lineHeight;
		if (glyph != null && caption != null) {
			// Tile layout: glyph left, label and caption stacked.
			g.text(font, glyph, x1 + 10, y1 + (height - font.lineHeight) / 2 + 1, Glass.mix(Glass.accent(), 0xFFFFFF, 0.65f), false);
			tx = x1 + 26;
			g.text(font, text, tx, ty, color, false);
			g.text(font, caption, tx, ty + font.lineHeight + 2, 0xE0DCE4FF, false);
			return;
		}
		String full = glyph != null ? glyph + "  " + text : text;
		tx = x1 + (width - font.width(full)) / 2;
		g.text(font, full, tx, ty, color, style != Style.PRIMARY);
		if (caption != null) {
			g.centeredText(font, caption, x1 + width / 2, ty + font.lineHeight + 2, 0xE0DCE4FF);
		}
	}

	@Override
	protected void updateWidgetNarration(NarrationElementOutput out) {
		defaultButtonNarrationText(out);
	}
}
