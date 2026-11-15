package mc.glched.glasscompanion.waypoints;

import mc.glched.glasscompanion.Glass;
import mc.glched.glasscompanion.ui.GlassButton;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

import com.mojang.blaze3d.platform.InputConstants;

/** Add or edit one waypoint: name, X/Y/Z, color swatches. Enter saves, Esc cancels. */
public final class WaypointEditScreen extends Screen {
	private final Screen parent;
	private final Waypoints.Waypoint waypoint;
	private final boolean isNew;
	private EditBox name, bx, by, bz;
	private int color;
	private int px1, py1, px2, py2;

	public WaypointEditScreen(Screen parent, Waypoints.Waypoint waypoint, boolean isNew) {
		super(Component.literal(isNew ? "New waypoint" : "Edit waypoint"));
		this.parent = parent;
		this.waypoint = waypoint;
		this.isNew = isNew;
		this.color = waypoint.color;
	}

	@Override
	protected void init() {
		int w = 260, h = 176;
		px1 = (width - w) / 2;
		py1 = (height - h) / 2;
		px2 = px1 + w;
		py2 = py1 + h;
		String keepName = name != null ? name.getValue() : waypoint.name;
		name = new EditBox(font, px1 + 12, py1 + 42, w - 24, 18, Component.literal("Name"));
		name.setMaxLength(32);
		name.setValue(keepName);
		addRenderableWidget(name);
		int fw = (w - 24 - 16) / 3;
		bx = coord(px1 + 12, py1 + 80, fw, bx != null ? bx.getValue() : String.valueOf(waypoint.x), "X");
		by = coord(px1 + 12 + fw + 8, py1 + 80, fw, by != null ? by.getValue() : String.valueOf(waypoint.y), "Y");
		bz = coord(px1 + 12 + 2 * (fw + 8), py1 + 80, fw, bz != null ? bz.getValue() : String.valueOf(waypoint.z), "Z");
		int bw = 76;
		if (!isNew) {
			addRenderableWidget(new GlassButton(px1 + 12, py2 - 30, bw, 20, "Delete", GlassButton.Style.DANGER, b -> {
				Waypoints.remove(minecraft, waypoint);
				minecraft.gui.setScreen(parent);
			}));
		}
		addRenderableWidget(new GlassButton(px2 - 12 - 2 * bw - 6, py2 - 30, bw, 20, "Cancel", GlassButton.Style.PLAIN, b -> onClose()));
		addRenderableWidget(new GlassButton(px2 - 12 - bw, py2 - 30, bw, 20, isNew ? "Add" : "Save", GlassButton.Style.PRIMARY, b -> save()));
		setInitialFocus(name);
	}

	private EditBox coord(int x, int y, int w, String value, String label) {
		EditBox box = new EditBox(font, x, y, w, 18, Component.literal(label));
		box.setMaxLength(9);
		box.setValue(value);
		addRenderableWidget(box);
		return box;
	}

	private static int parse(EditBox box, int fallback) {
		try {
			return Integer.parseInt(box.getValue().trim());
		} catch (NumberFormatException ex) {
			return fallback;
		}
	}

	private void save() {
		String n = name.getValue().trim();
		waypoint.name = n.isEmpty() ? Waypoints.nextName(minecraft) : n;
		waypoint.x = parse(bx, waypoint.x);
		waypoint.y = parse(by, waypoint.y);
		waypoint.z = parse(bz, waypoint.z);
		waypoint.color = color;
		if (isNew) {
			Waypoints.add(minecraft, waypoint);
		} else {
			Waypoints.save();
		}
		minecraft.gui.setScreen(parent);
	}

	@Override
	public boolean keyPressed(KeyEvent event) {
		if (event.input() == InputConstants.KEY_RETURN || event.input() == InputConstants.KEY_NUMPADENTER) {
			save();
			return true;
		}
		return super.keyPressed(event);
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
		g.text(font, title.getString(), px1 + 12, py1 + 12, 0xFFFFFFFF, true);
		g.text(font, Waypoints.prettyDimension(waypoint.dimension), px2 - 12 - font.width(Waypoints.prettyDimension(waypoint.dimension)), py1 + 12, 0x99C8D2F0, false);
		g.text(font, "Name", px1 + 12, py1 + 31, 0xB0D0D8F5, false);
		int fw = (px2 - px1 - 24 - 16) / 3;
		g.text(font, "X", px1 + 12, py1 + 69, 0xB0D0D8F5, false);
		g.text(font, "Y", px1 + 12 + fw + 8, py1 + 69, 0xB0D0D8F5, false);
		g.text(font, "Z", px1 + 12 + 2 * (fw + 8), py1 + 69, 0xB0D0D8F5, false);
		g.text(font, "Color", px1 + 12, py1 + 110, 0xB0D0D8F5, false);
		for (int i = 0; i < Waypoints.COLORS.length; i++) {
			int sx = px1 + 48 + i * 22, sy = py1 + 106;
			if (Waypoints.COLORS[i] == color) {
				Glass.rounded(g, sx - 2, sy - 2, sx + 16, sy + 16, 8, 0xFFFFFFFF);
			}
			Glass.rounded(g, sx, sy, sx + 14, sy + 14, 7, Waypoints.COLORS[i]);
		}
		super.extractRenderState(g, mouseX, mouseY, partial);
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
		for (int i = 0; i < Waypoints.COLORS.length; i++) {
			int sx = px1 + 48 + i * 22, sy = py1 + 106;
			if (event.x() >= sx - 2 && event.x() < sx + 16 && event.y() >= sy - 2 && event.y() < sy + 16) {
				color = Waypoints.COLORS[i];
				return true;
			}
		}
		return super.mouseClicked(event, doubleClick);
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
