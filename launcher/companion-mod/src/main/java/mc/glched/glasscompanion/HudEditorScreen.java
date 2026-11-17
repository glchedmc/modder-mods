package mc.glched.glasscompanion;

import java.util.Map;

import com.mojang.blaze3d.platform.InputConstants;

import mc.glched.glasscompanion.ui.GlassButton;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

/**
 * Lunar-style HUD editor. Drag an element to move it, drag one of its corner
 * handles to resize it, or scroll over it to scale it. Right-click puts it back
 * in its default spot at its default size. Positions are saved as screen
 * fractions and each element keeps its own scale (hudLayout: [x, y, scale]).
 */
public final class HudEditorScreen extends Screen {
	private static final int HANDLE = 5;
	private final Screen parent;
	private String dragging;
	private double grabX, grabY;
	/** Resize state: element, corner (0 TL, 1 TR, 2 BL, 3 BR), bounds and scale when the drag started. */
	private String resizing;
	private int corner;
	private int[] startBounds;
	private float startScale;

	public HudEditorScreen(Screen parent) {
		super(Component.literal("Edit HUD"));
		this.parent = parent;
	}

	@Override
	protected void init() {
		HudRenderer.editing = true;
		int y = height / 2 + 26;
		addRenderableWidget(new GlassButton(width / 2 - 104, y, 100, 20, "Reset all", GlassButton.Style.PLAIN, b -> {
			for (String id : HudRenderer.ELEMENTS.keySet()) {
				CompanionConfig.setLayout(id, null);
			}
			CompanionConfig.save();
		}));
		addRenderableWidget(new GlassButton(width / 2 + 4, y, 100, 20, "Done", GlassButton.Style.PRIMARY, b -> onClose()));
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mouseX, int mouseY, float partial) {
		// No blur: the point is to see the HUD. A light grid helps line things up.
		g.fill(0, 0, width, height, 0x30000010);
		for (int x = 0; x < width; x += 20) {
			g.fill(x, 0, x + 1, height, 0x0FFFFFFF);
		}
		for (int y = 0; y < height; y += 20) {
			g.fill(0, y, width, y + 1, 0x0FFFFFFF);
		}
		g.fill(width / 2, 0, width / 2 + 1, height, 0x20FFFFFF);
		g.fill(0, height / 2, width, height / 2 + 1, 0x20FFFFFF);
	}

	private static int[] corners(int[] b) {
		return new int[] {b[0] - 2, b[1] - 2, b[0] + b[2] + 2, b[1] - 2, b[0] - 2, b[1] + b[3] + 2, b[0] + b[2] + 2, b[1] + b[3] + 2};
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partial) {
		String hover = hit(mouseX, mouseY);
		for (Map.Entry<String, int[]> e : HudRenderer.BOUNDS.entrySet()) {
			String id = e.getKey();
			int[] b = e.getValue();
			boolean hot = id.equals(dragging) || id.equals(resizing) || id.equals(hover) || id.equals(handleAt(mouseX, mouseY) == null ? null : handleAt(mouseX, mouseY)[0]);
			int c = hot ? 0xFF000000 | Glass.accent() : 0x90FFFFFF;
			g.outline(b[0] - 2, b[1] - 2, b[2] + 4, b[3] + 4, c);
			if (hot) {
				g.fill(b[0] - 2, b[1] - 2, b[0] + b[2] + 2, b[1] + b[3] + 2, 0x207AA8FF);
			}
			// Corner scale handles.
			int[] k = corners(b);
			for (int i = 0; i < 4; i++) {
				int hx = k[i * 2], hy = k[i * 2 + 1];
				g.fill(hx - HANDLE / 2 - 1, hy - HANDLE / 2 - 1, hx + HANDLE / 2 + 2, hy + HANDLE / 2 + 2, 0xFF0A0D20);
				g.fill(hx - HANDLE / 2, hy - HANDLE / 2, hx + HANDLE / 2 + 1, hy + HANDLE / 2 + 1, hot ? 0xFFFFFFFF : 0xC0FFFFFF);
			}
			String name = HudRenderer.ELEMENTS.getOrDefault(id, id);
			float es = CompanionConfig.elementScale(id);
			if (hot || Math.abs(es - 1f) > 0.01f) {
				name += "  " + Math.round(es * 100) + "%";
			}
			int ty = b[1] - 14 < 0 ? b[1] + b[3] + 6 : b[1] - 14;
			g.text(font, name, b[0], ty, c, true);
		}
		int cw = 236;
		Glass.panel(g, width / 2 - cw / 2, height / 2 - 34, width / 2 + cw / 2, height / 2 + 52, 1f, 0x161A3A, 8);
		g.centeredText(font, "Edit HUD", width / 2, height / 2 - 26, 0xFFFFFFFF);
		g.centeredText(font, "Drag to move · drag a corner or scroll to resize", width / 2, height / 2 - 12, 0xB0D0D8F5);
		g.centeredText(font, "Right-click resets an element", width / 2, height / 2, 0xB0D0D8F5);
		g.centeredText(font, "Module overlays show when their module is on", width / 2, height / 2 + 12, 0x80D0D8F5);
		super.extractRenderState(g, mouseX, mouseY, partial);
	}

	private String hit(double mx, double my) {
		String found = null;
		for (Map.Entry<String, int[]> e : HudRenderer.BOUNDS.entrySet()) {
			int[] b = e.getValue();
			if (mx >= b[0] - 2 && mx < b[0] + b[2] + 2 && my >= b[1] - 2 && my < b[1] + b[3] + 2) {
				found = e.getKey();
			}
		}
		return found;
	}

	/** {element id, corner index} of the handle under the mouse, or null. */
	private Object[] handleAt(double mx, double my) {
		Object[] found = null;
		for (Map.Entry<String, int[]> e : HudRenderer.BOUNDS.entrySet()) {
			int[] k = corners(e.getValue());
			for (int i = 0; i < 4; i++) {
				if (Math.abs(mx - k[i * 2]) <= HANDLE && Math.abs(my - k[i * 2 + 1]) <= HANDLE) {
					found = new Object[] {e.getKey(), i};
				}
			}
		}
		return found;
	}

	private boolean startAt(double mx, double my) {
		Object[] h = handleAt(mx, my);
		if (h != null) {
			resizing = (String) h[0];
			corner = (Integer) h[1];
			startBounds = HudRenderer.BOUNDS.get(resizing).clone();
			startScale = HudRenderer.scaleOf(resizing);
			return true;
		}
		String id = hit(mx, my);
		if (id == null) {
			return false;
		}
		int[] b = HudRenderer.BOUNDS.get(id);
		dragging = id;
		grabX = mx - b[0];
		grabY = my - b[1];
		return true;
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
		if (super.mouseClicked(event, doubleClick)) {
			return true;
		}
		if (event.button() == InputConstants.MOUSE_BUTTON_RIGHT) {
			String id = hit(event.x(), event.y());
			if (id == null) {
				Object[] h = handleAt(event.x(), event.y());
				id = h == null ? null : (String) h[0];
			}
			if (id == null) {
				return false;
			}
			CompanionConfig.setLayout(id, null);
			CompanionConfig.save();
			return true;
		}
		if (startAt(event.x(), event.y())) {
			setDragging(true);
			return true;
		}
		return false;
	}

	@Override
	public boolean mouseDragged(MouseButtonEvent event, double dx, double dy) {
		if (dragging == null && resizing == null && event.button() == InputConstants.MOUSE_BUTTON_LEFT) {
			// Some platforms deliver the press to a widget pass first; start here too.
			startAt(event.x() - dx, event.y() - dy);
		}
		if (resizing != null) {
			resize(event.x(), event.y());
			return true;
		}
		if (dragging != null && HudRenderer.BOUNDS.containsKey(dragging)) {
			int[] b = HudRenderer.BOUNDS.get(dragging);
			int nx = (int) Math.round(event.x() - grabX);
			int ny = (int) Math.round(event.y() - grabY);
			// Snap to the screen center lines within 4 px.
			if (Math.abs(nx + b[2] / 2 - width / 2) < 4) {
				nx = width / 2 - b[2] / 2;
			}
			if (Math.abs(ny + b[3] / 2 - height / 2) < 4) {
				ny = height / 2 - b[3] / 2;
			}
			CompanionConfig.setLayout(dragging, HudRenderer.toFractions(dragging, nx, ny, b[2], b[3], width, height, HudRenderer.scaleOf(dragging)));
			return true;
		}
		return super.mouseDragged(event, dx, dy);
	}

	/** Scales around the corner opposite the grabbed handle. */
	private void resize(double mx, double my) {
		int[] b = startBounds;
		boolean left = corner == 0 || corner == 2;
		boolean top = corner == 0 || corner == 1;
		double ax = left ? b[0] + b[2] : b[0];
		double ay = top ? b[1] + b[3] : b[1];
		double fw = Math.abs(mx - ax) / Math.max(1, b[2]);
		double fh = Math.abs(my - ay) / Math.max(1, b[3]);
		double factor = Math.max(fw, fh);
		applyScale(resizing, (float) (startScale * factor), b, ax, ay, left, top);
	}

	private void applyScale(String id, float target, int[] b, double ax, double ay, boolean left, boolean top) {
		float global = HudRenderer.baseScale(id);
		float es = Math.max(CompanionConfig.MIN_ELEMENT_SCALE, Math.min(CompanionConfig.MAX_ELEMENT_SCALE, target / global));
		// Snap near 100%.
		if (Math.abs(es - 1f) < 0.04f) {
			es = 1f;
		}
		float s = es * global;
		double ratio = s / (double) startScale;
		int nw = (int) Math.round(b[2] * ratio);
		int nh = (int) Math.round(b[3] * ratio);
		int nx = (int) Math.round(left ? ax - nw : ax);
		int ny = (int) Math.round(top ? ay - nh : ay);
		float[] f = HudRenderer.toFractions(id, nx, ny, nw, nh, width, height, s);
		CompanionConfig.setLayout(id, new float[] {f[0], f[1], es});
	}

	@Override
	public boolean mouseScrolled(double x, double y, double sx, double sy) {
		String id = hit(x, y);
		if (id == null || sy == 0) {
			return super.mouseScrolled(x, y, sx, sy);
		}
		int[] b = HudRenderer.BOUNDS.get(id).clone();
		float cur = HudRenderer.scaleOf(id);
		float target = (float) (cur * Math.pow(1.1, Math.signum(sy)));
		// Grow or shrink around the element's center.
		double cx = b[0] + b[2] / 2.0, cy = b[1] + b[3] / 2.0;
		applyScaleCentered(id, target, b, cx, cy);
		CompanionConfig.save();
		return true;
	}

	private void applyScaleCentered(String id, float target, int[] b, double cx, double cy) {
		float global = HudRenderer.baseScale(id);
		float es = Math.max(CompanionConfig.MIN_ELEMENT_SCALE, Math.min(CompanionConfig.MAX_ELEMENT_SCALE, target / global));
		if (Math.abs(es - 1f) < 0.04f) {
			es = 1f;
		}
		float s = es * global;
		double ratio = s / (double) HudRenderer.scaleOf(id);
		int nw = (int) Math.round(b[2] * ratio);
		int nh = (int) Math.round(b[3] * ratio);
		float[] f = HudRenderer.toFractions(id, (int) Math.round(cx - nw / 2.0), (int) Math.round(cy - nh / 2.0), nw, nh, width, height, s);
		CompanionConfig.setLayout(id, new float[] {f[0], f[1], es});
	}

	@Override
	public boolean mouseReleased(MouseButtonEvent event) {
		if (dragging != null || resizing != null) {
			dragging = null;
			resizing = null;
			setDragging(false);
			CompanionConfig.save();
			return true;
		}
		return super.mouseReleased(event);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	@Override
	public void removed() {
		HudRenderer.editing = false;
	}

	@Override
	public void onClose() {
		HudRenderer.editing = false;
		CompanionConfig.save();
		minecraft.gui.setScreen(parent);
	}

}
