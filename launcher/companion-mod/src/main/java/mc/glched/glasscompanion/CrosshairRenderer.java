package mc.glched.glasscompanion;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;

/** Draws a configurable cross-style crosshair in place of the vanilla one. */
public final class CrosshairRenderer {
	private CrosshairRenderer() {
	}

	public static void extract(GuiGraphicsExtractor g) {
		Minecraft mc = Minecraft.getInstance();
		if (!mc.options.getCameraType().isFirstPerson()) {
			return;
		}
		int cx = g.guiWidth() / 2;
		int cy = g.guiHeight() / 2;
		int len = (int) CompanionConfig.num("crosshairSize");
		int gap = (int) CompanionConfig.num("crosshairGap");
		int t = Math.max(1, (int) CompanionConfig.num("crosshairThickness"));
		int color = CompanionConfig.color("crosshairColor");
		boolean outline = CompanionConfig.bool("crosshairOutline");
		int half = t / 2;
		int[][] arms = {
				{cx - gap - len, cy - half, cx - gap, cy - half + t},
				{cx + gap + 1, cy - half, cx + gap + 1 + len, cy - half + t},
				{cx - half, cy - gap - len, cx - half + t, cy - gap},
				{cx - half, cy + gap + 1, cx - half + t, cy + gap + 1 + len},
		};
		if (outline) {
			for (int[] a : arms) {
				g.fill(a[0] - 1, a[1] - 1, a[2] + 1, a[3] + 1, 0xC0000000);
			}
			if (CompanionConfig.bool("crosshairDot")) {
				g.fill(cx - half - 1, cy - half - 1, cx - half + t + 1, cy - half + t + 1, 0xC0000000);
			}
		}
		for (int[] a : arms) {
			g.fill(a[0], a[1], a[2], a[3], color);
		}
		if (CompanionConfig.bool("crosshairDot")) {
			g.fill(cx - half, cy - half, cx - half + t, cy - half + t, color);
		}
	}
}
