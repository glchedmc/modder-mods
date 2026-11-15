package mc.glched.glasscompanion;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.resources.Identifier;

/**
 * Saturn's liquid-glass look in game: rounded translucent panels with a light
 * rim and top sheen. Strength follows the launcher's glass setting (synced as
 * menuGlass): 0 gives solid panels and no blur, 1 the clearest glass.
 */
public final class Glass {
	public static final Identifier LOGO = GlassCompanion.id("textures/gui/saturn_logo.png");

	private Glass() {
	}

	public static float strength() {
		return (float) Math.max(0, Math.min(1, CompanionConfig.num("menuGlass")));
	}

	public static boolean blur() {
		return strength() > 0.02f;
	}

	public static int accent() {
		return CompanionConfig.color("menuAccent");
	}

	/** Panel fill alpha: nearly opaque at strength 0, airy at strength 1. */
	public static int alpha(float weight) {
		float a = 0.93f - 0.55f * strength();
		return Math.max(0, Math.min(255, Math.round(255 * a * weight)));
	}

	public static void panel(GuiGraphicsExtractor g, int x1, int y1, int x2, int y2, float weight) {
		panel(g, x1, y1, x2, y2, weight, 0x161A3A, 6);
	}

	public static void panel(GuiGraphicsExtractor g, int x1, int y1, int x2, int y2, float weight, int rgb, int radius) {
		int fill = (alpha(weight) << 24) | (rgb & 0xFFFFFF);
		rounded(g, x1, y1, x2, y2, radius, fill);
		// Sheen on the top third and a thin light rim, like the launcher's glass cards.
		int sheen = Math.round(40 * weight * (0.4f + strength())) << 24 | 0xFFFFFF;
		g.fillGradient(x1 + radius, y1 + 1, x2 - radius, y1 + Math.max(3, (y2 - y1) / 3), sheen, 0x00FFFFFF);
		int rim = Math.round(70 * weight) << 24 | 0xFFFFFF;
		g.fill(x1 + radius, y1, x2 - radius, y1 + 1, rim);
		int rimLow = Math.round(28 * weight) << 24 | 0xFFFFFF;
		g.fill(x1 + radius, y2 - 1, x2 - radius, y2, rimLow);
		g.fill(x1, y1 + radius, x1 + 1, y2 - radius, rimLow);
		g.fill(x2 - 1, y1 + radius, x2, y2 - radius, rimLow);
	}

	/** Filled rectangle with rounded corners of the given radius. */
	public static void rounded(GuiGraphicsExtractor g, int x1, int y1, int x2, int y2, int r, int color) {
		r = Math.max(0, Math.min(r, Math.min((x2 - x1) / 2, (y2 - y1) / 2)));
		for (int i = 0; i < r; i++) {
			double dy = r - i - 0.5;
			int inset = (int) Math.round(r - Math.sqrt(Math.max(0, r * r - dy * dy)));
			g.fill(x1 + inset, y1 + i, x2 - inset, y1 + i + 1, color);
			g.fill(x1 + inset, y2 - i - 1, x2 - inset, y2 - i, color);
		}
		g.fill(x1, y1 + r, x2, y2 - r, color);
	}

	/** The Saturn ring logo. */
	public static void logo(GuiGraphicsExtractor g, int x, int y, int size) {
		g.blit(RenderPipelines.GUI_TEXTURED, LOGO, x, y, 0f, 0f, size, size, 128, 128, 128, 128);
	}

	/** Darkening wash over a blurred background, lighter when the glass is clearer. */
	public static void wash(GuiGraphicsExtractor g, int w, int h) {
		int top = Math.round(255 * (0.55f - 0.35f * strength())) << 24 | 0x0B0E26;
		int bottom = Math.round(255 * (0.75f - 0.35f * strength())) << 24 | 0x1B1446;
		g.fillGradient(0, 0, w, h, top, bottom);
	}

	public static int mix(int a, int b, float t) {
		int ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255;
		int br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
		return 0xFF000000 | Math.round(ar + (br - ar) * t) << 16 | Math.round(ag + (bg - ag) * t) << 8 | Math.round(ab + (bb - ab) * t);
	}
}
