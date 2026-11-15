package mc.glched.glasscompanion;

import java.util.Map;

import com.mojang.blaze3d.platform.InputConstants;

import mc.glched.glasscompanion.ui.GlassButton;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

/**
 * Drag HUD elements where you want them, like Lunar's HUD editor. Right-click
 * an element to put it back in its default spot. Positions are saved as screen
 * fractions, so they survive window resizes and GUI scale changes.
 */
public final class HudEditorScreen extends Screen {
	private final Screen parent;
	private String dragging;
	private double grabX, grabY;

	public HudEditorScreen(Screen parent) {
		super(Component.literal("Edit HUD"));
		this.parent = parent;
	}

	@Override
	protected void init() {
		HudRenderer.editing = true;
		int y = height / 2 + 20;
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

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partial) {
		for (Map.Entry<String, int[]> e : HudRenderer.BOUNDS.entrySet()) {
			int[] b = e.getValue();
			boolean hot = e.getKey().equals(dragging) || (mouseX >= b[0] && mouseX < b[0] + b[2] && mouseY >= b[1] && mouseY < b[1] + b[3]);
			int c = hot ? 0xFF000000 | Glass.accent() : 0x90FFFFFF;
			g.outline(b[0] - 2, b[1] - 2, b[2] + 4, b[3] + 4, c);
			if (hot) {
				g.fill(b[0] - 2, b[1] - 2, b[0] + b[2] + 2, b[1] + b[3] + 2, 0x207AA8FF);
			}
			String name = HudRenderer.ELEMENTS.getOrDefault(e.getKey(), e.getKey());
			int ty = b[1] - 12 < 0 ? b[1] + b[3] + 4 : b[1] - 12;
			g.text(font, name, b[0], ty, c, true);
		}
		int cw = 220;
		Glass.panel(g, width / 2 - cw / 2, height / 2 - 30, width / 2 + cw / 2, height / 2 + 46, 1f, 0x161A3A, 8);
		g.centeredText(font, "Edit HUD", width / 2, height / 2 - 22, 0xFFFFFFFF);
		g.centeredText(font, "Drag elements · right-click resets", width / 2, height / 2 - 8, 0xB0D0D8F5);
		g.centeredText(font, "Turn elements on in Saturn mods", width / 2, height / 2 + 4, 0x80D0D8F5);
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

	@Override
	public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
		if (super.mouseClicked(event, doubleClick)) {
			return true;
		}
		String id = hit(event.x(), event.y());
		if (id == null) {
			return false;
		}
		if (event.button() == InputConstants.MOUSE_BUTTON_RIGHT) {
			CompanionConfig.setLayout(id, null);
			CompanionConfig.save();
			return true;
		}
		int[] b = HudRenderer.BOUNDS.get(id);
		dragging = id;
		setDragging(true);
		grabX = event.x() - b[0];
		grabY = event.y() - b[1];
		return true;
	}

	@Override
	public boolean mouseDragged(MouseButtonEvent event, double dx, double dy) {
		if (dragging == null && event.button() == InputConstants.MOUSE_BUTTON_LEFT) {
			// Some platforms deliver the press to a widget pass first; start the drag here too.
			String id = hit(event.x() - dx, event.y() - dy);
			if (id != null) {
				int[] b = HudRenderer.BOUNDS.get(id);
				dragging = id;
				grabX = event.x() - dx - b[0];
				grabY = event.y() - dy - b[1];
			}
		}
		if (dragging != null && HudRenderer.BOUNDS.containsKey(dragging)) {
			int[] b = HudRenderer.BOUNDS.get(dragging);
			int nx = (int) Math.round(event.x() - grabX);
			int ny = (int) Math.round(event.y() - grabY);
			// Snap to the screen center lines and edges within 4 px.
			if (Math.abs(nx + b[2] / 2 - width / 2) < 4) {
				nx = width / 2 - b[2] / 2;
			}
			if (Math.abs(ny + b[3] / 2 - height / 2) < 4) {
				ny = height / 2 - b[3] / 2;
			}
			CompanionConfig.setLayout(dragging, HudRenderer.toFractions(nx, ny, b[2], b[3], width, height));
			return true;
		}
		return super.mouseDragged(event, dx, dy);
	}

	@Override
	public boolean mouseReleased(MouseButtonEvent event) {
		if (dragging != null) {
			dragging = null;
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
