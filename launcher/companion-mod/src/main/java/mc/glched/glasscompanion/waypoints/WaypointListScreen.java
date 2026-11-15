package mc.glched.glasscompanion.waypoints;

import java.util.ArrayList;
import java.util.List;

import mc.glched.glasscompanion.Glass;
import mc.glched.glasscompanion.ui.GlassButton;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;

/**
 * Waypoint list (Lunar's waypoint menu): every waypoint of this world with its
 * color, coordinates, dimension and distance. Click the dot to change color,
 * the switch to show or hide, Edit to rename or move, × to delete.
 */
public final class WaypointListScreen extends Screen {
	private static final int ROW_H = 30;
	private static boolean allDimensions;
	private final Screen parent;
	private double scroll;
	private int px1, py1, px2, py2, listY1, listY2;

	public WaypointListScreen(Screen parent) {
		super(Component.literal("Waypoints"));
		this.parent = parent;
	}

	@Override
	protected void init() {
		int w = Math.min(460, width - 24);
		int h = Math.min(300, height - 24);
		px1 = (width - w) / 2;
		py1 = (height - h) / 2;
		px2 = px1 + w;
		py2 = py1 + h;
		listY1 = py1 + 40;
		listY2 = py2 - 36;
		addRenderableWidget(new GlassButton(px1 + 12, py2 - 28, 110, 20, "+ Add here", GlassButton.Style.PLAIN, b -> {
			if (minecraft.player != null) {
				minecraft.gui.setScreen(new WaypointEditScreen(this, WaypointKeys.newHere(minecraft), true));
			}
		}));
		addRenderableWidget(new GlassButton(px1 + 128, py2 - 28, 120, 20, allDimensions ? "All dimensions" : "This dimension", GlassButton.Style.GHOST, b -> {
			allDimensions = !allDimensions;
			rebuildWidgets();
		}));
		addRenderableWidget(new GlassButton(px2 - 84, py2 - 28, 72, 20, "Done", GlassButton.Style.PRIMARY, b -> onClose()));
	}

	private List<Waypoints.Waypoint> rows() {
		String dim = Waypoints.dimension(minecraft);
		List<Waypoints.Waypoint> out = new ArrayList<>();
		for (Waypoints.Waypoint w : Waypoints.all(minecraft)) {
			if (allDimensions || w.dimension.equals(dim)) {
				out.add(w);
			}
		}
		return out;
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mouseX, int mouseY, float partial) {
		if (Glass.blur()) {
			extractBlurredBackground(g);
		}
		Glass.wash(g, width, height);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partial) {
		Glass.panel(g, px1, py1, px2, py2, 1f, 0x161A3A, 10);
		Glass.logo(g, px1 + 10, py1 + 8, 22);
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(px1 + 38, py1 + 10);
		pose.scale(1.3f, 1.3f);
		g.text(font, "Waypoints", 0, 0, 0xFFFFFFFF, true);
		pose.popMatrix();
		String hint = WaypointKeys.addKeyName() + " adds one here · " + WaypointKeys.listKeyName() + " opens this list";
		g.text(font, hint, px2 - 12 - font.width(hint), py1 + 15, 0x80D0D8F5, false);
		List<Waypoints.Waypoint> list = rows();
		int contentH = list.size() * (ROW_H + 4);
		scroll = Mth.clamp(scroll, 0, Math.max(0, contentH - (listY2 - listY1)));
		if (list.isEmpty()) {
			g.centeredText(font, "No waypoints yet. Press " + WaypointKeys.addKeyName() + " in game or Add here.", (px1 + px2) / 2, (listY1 + listY2) / 2 - 4, 0xB0D0D8F5);
		}
		g.enableScissor(px1 + 8, listY1, px2 - 8, listY2);
		int y = listY1 - (int) scroll;
		String dim = Waypoints.dimension(minecraft);
		for (Waypoints.Waypoint w : list) {
			if (y + ROW_H >= listY1 && y <= listY2) {
				drawRow(g, w, px1 + 12, y, px2 - 12, mouseX, mouseY, w.dimension.equals(dim));
			}
			y += ROW_H + 4;
		}
		g.disableScissor();
		super.extractRenderState(g, mouseX, mouseY, partial);
	}

	private void drawRow(GuiGraphicsExtractor g, Waypoints.Waypoint w, int x1, int y, int x2, int mouseX, int mouseY, boolean here) {
		boolean hot = mouseX >= x1 && mouseX < x2 && mouseY >= y && mouseY < y + ROW_H && mouseY >= listY1 && mouseY < listY2;
		Glass.panel(g, x1, y, x2, y + ROW_H, hot ? 0.9f : 0.6f, hot ? 0x242A60 : 0x1A1E44, 6);
		Glass.rounded(g, x1 + 8, y + 8, x1 + 22, y + 22, 7, w.color | 0xFF000000);
		int text = w.enabled ? 0xFFFFFFFF : 0x80FFFFFF;
		g.text(font, (w.death ? "☠ " : "") + w.name, x1 + 30, y + 5, text, false);
		String sub = w.x + ", " + w.y + ", " + w.z + "  ·  " + Waypoints.prettyDimension(w.dimension);
		if (here && minecraft.player != null) {
			double d = Math.sqrt(minecraft.player.distanceToSqr(w.x + 0.5, w.y + 0.5, w.z + 0.5));
			sub += "  ·  " + WaypointRenderer.formatDistance(d);
		}
		g.text(font, sub, x1 + 30, y + 17, 0x99C8D2F0, false);
		// × delete, Edit, visibility switch (right to left).
		int bx = x2 - 22;
		boolean delHot = hot && mouseX >= bx && mouseX < bx + 16;
		Glass.rounded(g, bx, y + 7, bx + 16, y + 23, 8, delHot ? 0xC0FF5A6E : 0x30FFFFFF);
		g.centeredText(font, "×", bx + 8, y + 11, 0xFFFFFFFF);
		int ex = bx - 42;
		boolean editHot = hot && mouseX >= ex && mouseX < ex + 36;
		Glass.rounded(g, ex, y + 7, ex + 36, y + 23, 8, editHot ? 0x70FFFFFF : 0x30FFFFFF);
		g.centeredText(font, "Edit", ex + 18, y + 11, 0xFFFFFFFF);
		int sx2 = ex - 8, sx1 = sx2 - 26, sy = y + 8;
		Glass.rounded(g, sx1, sy, sx2, sy + 14, 7, w.enabled ? (0xFF000000 | Glass.accent()) : 0x50FFFFFF);
		int knob = w.enabled ? sx2 - 13 : sx1 + 1;
		Glass.rounded(g, knob, sy + 1, knob + 12, sy + 13, 6, 0xFFFFFFFF);
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
		if (super.mouseClicked(event, doubleClick)) {
			return true;
		}
		double mx = event.x(), my = event.y();
		int x1 = px1 + 12, x2 = px2 - 12;
		if (mx < x1 || mx >= x2 || my < listY1 || my >= listY2) {
			return false;
		}
		int y = listY1 - (int) scroll;
		for (Waypoints.Waypoint w : rows()) {
			if (my >= y && my < y + ROW_H) {
				int bx = x2 - 22, ex = bx - 42, sx2 = ex - 8, sx1 = sx2 - 26;
				if (mx >= bx) {
					Waypoints.remove(minecraft, w);
				} else if (mx >= ex && mx < ex + 36) {
					minecraft.gui.setScreen(new WaypointEditScreen(this, w, false));
				} else if (mx >= sx1 - 2 && mx < sx2 + 2) {
					w.enabled = !w.enabled;
					Waypoints.save();
				} else if (mx < x1 + 26) {
					int i = 0;
					while (i < Waypoints.COLORS.length && Waypoints.COLORS[i] != w.color) {
						i++;
					}
					w.color = Waypoints.COLORS[(i + 1) % Waypoints.COLORS.length];
					Waypoints.save();
				} else if (doubleClick) {
					minecraft.gui.setScreen(new WaypointEditScreen(this, w, false));
				}
				return true;
			}
			y += ROW_H + 4;
		}
		return false;
	}

	@Override
	public boolean mouseScrolled(double x, double y, double sx, double sy) {
		scroll -= sy * 20;
		return true;
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	@Override
	public void onClose() {
		minecraft.gui.setScreen(parent);
	}
}
