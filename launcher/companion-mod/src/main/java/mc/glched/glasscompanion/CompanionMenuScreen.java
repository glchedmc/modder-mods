package mc.glched.glasscompanion;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import mc.glched.glasscompanion.ui.GlassButton;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;

/**
 * Saturn mod menu (Right Shift): categories on the left, a scrolling list of
 * modules with switches and sliders on the right, and the HUD editor one click
 * away. Same settings as the launcher's Built-in mods page
 * (config/glass-companion.json, picked up live by both sides).
 */
public final class CompanionMenuScreen extends Screen {
	private static final String[] COLORS = {"#FFFFFF", "#7AA8FF", "#B28DFF", "#FF8FB1", "#FFB36B", "#5BE49B", "#FF5555", "#FFFF55"};
	private static final int ROW_H = 30;
	private static int tab = 0;
	private final Screen parent;
	private double scroll;
	private int px1, py1, px2, py2, listX1, listY1, listX2, listY2, sideW;
	private CompanionConfig.Feature dragging;
	private int dragX1, dragX2;

	public CompanionMenuScreen(Screen parent) {
		super(Component.literal("Saturn mods"));
		this.parent = parent;
	}

	@Override
	protected void init() {
		int w = Math.min(560, width - 24);
		int h = Math.min(330, height - 24);
		px1 = (width - w) / 2;
		py1 = (height - h) / 2;
		px2 = px1 + w;
		py2 = py1 + h;
		sideW = 118;
		listX1 = px1 + sideW + 10;
		listX2 = px2 - 10;
		listY1 = py1 + 40;
		listY2 = py2 - 10;
		List<CompanionConfig.Group> groups = CompanionConfig.groups();
		int y = py1 + 40;
		for (int i = 0; i < groups.size(); i++) {
			final int idx = i;
			addRenderableWidget(new GlassButton(px1 + 8, y, sideW - 8, 20, Component.literal(groups.get(i).label()),
					i == tab ? GlassButton.Style.PRIMARY : GlassButton.Style.GHOST, null, null, b -> {
						tab = idx;
						scroll = 0;
						rebuildWidgets();
					}));
			y += 23;
		}
		addRenderableWidget(new GlassButton(px2 - 172, py1 + 9, 84, 20, "Edit HUD", GlassButton.Style.PLAIN, b -> minecraft.gui.setScreen(new HudEditorScreen(this))));
		addRenderableWidget(new GlassButton(px2 - 84, py1 + 9, 74, 20, "Done", GlassButton.Style.PRIMARY, b -> onClose()));
	}

	private List<CompanionConfig.Feature> rows() {
		List<CompanionConfig.Group> groups = CompanionConfig.groups();
		String groupId = groups.get(Math.min(tab, groups.size() - 1)).id();
		List<CompanionConfig.Feature> list = new ArrayList<>();
		for (CompanionConfig.Feature f : CompanionConfig.features()) {
			if (f.group().equals(groupId) && !f.type().equals("layout")) {
				list.add(f);
			}
		}
		return list;
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mouseX, int mouseY, float partial) {
		if (minecraft.level == null) {
			extractPanorama(g, partial);
		}
		if (Glass.blur()) {
			extractBlurredBackground(g);
		}
		Glass.wash(g, width, height);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partial) {
		Glass.panel(g, px1, py1, px2, py2, 1f, 0x161A3A, 10);
		g.fill(px1 + sideW + 2, py1 + 38, px1 + sideW + 3, py2 - 10, 0x30FFFFFF);
		Glass.logo(g, px1 + 10, py1 + 8, 24);
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(px1 + 40, py1 + 11);
		pose.scale(1.3f, 1.3f);
		g.text(font, "Saturn mods", 0, 0, 0xFFFFFFFF, true);
		pose.popMatrix();
		g.text(font, "Right Shift", px1 + 40, py1 + 25, 0x80D0D8F5, false);

		List<CompanionConfig.Feature> list = rows();
		int contentH = list.size() * (ROW_H + 4);
		scroll = Mth.clamp(scroll, 0, Math.max(0, contentH - (listY2 - listY1)));
		g.enableScissor(listX1, listY1, listX2, listY2);
		int y = listY1 - (int) scroll;
		for (CompanionConfig.Feature f : list) {
			if (y + ROW_H >= listY1 && y <= listY2) {
				drawRow(g, f, listX1, y, listX2, mouseX, mouseY);
			}
			y += ROW_H + 4;
		}
		g.disableScissor();
		if (contentH > listY2 - listY1) {
			int barH = Math.max(20, (listY2 - listY1) * (listY2 - listY1) / contentH);
			int barY = listY1 + (int) ((listY2 - listY1 - barH) * (scroll / Math.max(1, contentH - (listY2 - listY1))));
			Glass.rounded(g, listX2 + 3, barY, listX2 + 6, barY + barH, 1, 0x60FFFFFF);
		}
		super.extractRenderState(g, mouseX, mouseY, partial);
	}

	private void drawRow(GuiGraphicsExtractor g, CompanionConfig.Feature f, int x1, int y, int x2, int mouseX, int mouseY) {
		boolean hot = mouseX >= x1 && mouseX < x2 && mouseY >= y && mouseY < y + ROW_H && mouseY >= listY1 && mouseY < listY2;
		Glass.panel(g, x1, y, x2, y + ROW_H, hot ? 0.9f : 0.6f, hot ? 0x242A60 : 0x1A1E44, 6);
		String standalone = f.standaloneLoaded();
		int textColor = standalone != null ? 0x90FFFFFF : 0xFFFFFFFF;
		g.text(font, f.label(), x1 + 8, y + 5, textColor, false);
		String sub = standalone != null ? "Off here: the standalone " + standalone + " mod is installed" : f.hint();
		if (sub != null && !sub.isEmpty()) {
			String clipped = font.plainSubstrByWidth(sub, x2 - x1 - 110);
			g.text(font, clipped.length() < sub.length() ? clipped + "…" : clipped, x1 + 8, y + 17, standalone != null ? 0xC0FFC36B : 0x99C8D2F0, false);
		}
		int cx2 = x2 - 8;
		switch (f.type()) {
			case "bool" -> {
				boolean on = CompanionConfig.bool(f.key()) && standalone == null;
				int sx1 = cx2 - 26, sy = y + (ROW_H - 14) / 2;
				Glass.rounded(g, sx1, sy, cx2, sy + 14, 7, on ? (0xFF000000 | Glass.accent()) : 0x50FFFFFF);
				int knob = on ? cx2 - 13 : sx1 + 1;
				Glass.rounded(g, knob, sy + 1, knob + 12, sy + 13, 6, 0xFFFFFFFF);
			}
			case "number" -> {
				int sx1 = cx2 - 96, sy = y + ROW_H / 2;
				double v = CompanionConfig.num(f.key());
				float t = (float) ((v - f.min()) / (f.max() - f.min()));
				Glass.rounded(g, sx1, sy - 2, cx2 - 30, sy + 2, 2, 0x50FFFFFF);
				int fillX = sx1 + Math.round((cx2 - 30 - sx1) * t);
				Glass.rounded(g, sx1, sy - 2, fillX, sy + 2, 2, 0xFF000000 | Glass.accent());
				Glass.rounded(g, fillX - 4, sy - 5, fillX + 4, sy + 5, 4, 0xFFFFFFFF);
				String label = f.step() < 1 ? String.format(Locale.ROOT, "%.2f", v) : String.valueOf((int) v);
				g.text(font, label, cx2 - font.width(label), sy - 4, 0xFFE6EAFF, false);
			}
			case "choice" -> {
				String label = choiceLabel(f);
				int pw = font.width(label) + 16;
				int sy = y + (ROW_H - 16) / 2;
				Glass.rounded(g, cx2 - pw, sy, cx2, sy + 16, 8, 0x40FFFFFF);
				g.text(font, label + " ›", cx2 - pw + 6, sy + 4, 0xFFFFFFFF, false);
			}
			case "color" -> {
				int sy = y + (ROW_H - 14) / 2;
				Glass.rounded(g, cx2 - 30, sy, cx2, sy + 14, 4, CompanionConfig.color(f.key()));
			}
			default -> {
			}
		}
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
		if (super.mouseClicked(event, doubleClick)) {
			return true;
		}
		double mx = event.x(), my = event.y();
		if (mx < listX1 || mx >= listX2 || my < listY1 || my >= listY2) {
			return false;
		}
		int y = listY1 - (int) scroll;
		for (CompanionConfig.Feature f : rows()) {
			if (my >= y && my < y + ROW_H) {
				if (f.standaloneLoaded() != null) {
					return true;
				}
				switch (f.type()) {
					case "bool" -> {
						CompanionConfig.set(f.key(), !CompanionConfig.bool(f.key()));
						CompanionConfig.save();
					}
					case "color" -> {
						String cur = CompanionConfig.string(f.key()).toUpperCase(Locale.ROOT);
						int i = 0;
						while (i < COLORS.length && !COLORS[i].equals(cur)) {
							i++;
						}
						CompanionConfig.set(f.key(), COLORS[(i + 1) % COLORS.length]);
						CompanionConfig.save();
					}
					case "choice" -> {
						List<String> opts = f.options();
						if (!opts.isEmpty()) {
							int i = Math.max(0, opts.indexOf(CompanionConfig.string(f.key())));
							CompanionConfig.set(f.key(), opts.get((i + 1) % opts.size()));
							CompanionConfig.save();
						}
					}
					case "number" -> {
						dragging = f;
						dragX1 = listX2 - 8 - 96;
						dragX2 = listX2 - 8 - 30;
						setSlider(mx);
					}
					default -> {
					}
				}
				return true;
			}
			y += ROW_H + 4;
		}
		return false;
	}

	private static String choiceLabel(CompanionConfig.Feature f) {
		String v = CompanionConfig.string(f.key());
		int i = f.options().indexOf(v);
		if (i >= 0 && i < f.labels().size()) {
			return f.labels().get(i);
		}
		return v.isEmpty() ? "-" : Character.toUpperCase(v.charAt(0)) + v.substring(1);
	}

	private void setSlider(double mx) {
		CompanionConfig.Feature f = dragging;
		double t = Mth.clamp((mx - dragX1) / Math.max(1, dragX2 - dragX1), 0, 1);
		double raw = f.min() + t * (f.max() - f.min());
		CompanionConfig.set(f.key(), Math.round(raw / f.step()) * f.step());
	}

	@Override
	public boolean mouseDragged(MouseButtonEvent event, double dx, double dy) {
		if (dragging != null) {
			setSlider(event.x());
			return true;
		}
		return super.mouseDragged(event, dx, dy);
	}

	@Override
	public boolean mouseReleased(MouseButtonEvent event) {
		if (dragging != null) {
			dragging = null;
			CompanionConfig.save();
			return true;
		}
		return super.mouseReleased(event);
	}

	@Override
	public boolean mouseScrolled(double x, double y, double sx, double sy) {
		scroll -= sy * 20;
		return true;
	}

	@Override
	public void onClose() {
		CompanionConfig.save();
		minecraft.gui.setScreen(parent);
	}
}
