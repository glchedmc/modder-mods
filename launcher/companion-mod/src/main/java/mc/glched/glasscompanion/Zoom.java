package mc.glched.glasscompanion;

import net.minecraft.client.Minecraft;

/** Hold-to-zoom with optional smoothing; scroll adjusts strength while held. */
public final class Zoom {
	private static double current = 1.0;
	private static double previous = 1.0;
	private static double scrollBonus = 0.0;

	private Zoom() {
	}

	public static boolean active() {
		return CompanionConfig.bool("zoom") && GlassCompanion.zoomKey != null && GlassCompanion.zoomKey.isDown()
				&& Minecraft.getInstance().gui.screen() == null;
	}

	static void tick(Minecraft client) {
		previous = current;
		double target = active() ? Math.max(1.0, CompanionConfig.num("zoomFactor") + scrollBonus) : 1.0;
		if (!active()) {
			scrollBonus = 0.0;
		}
		if (CompanionConfig.bool("smoothZoom")) {
			current += (target - current) * 0.5;
			if (Math.abs(target - current) < 0.01) {
				current = target;
			}
		} else {
			current = target;
		}
	}

	/** Returns true when the scroll was consumed by zoom. */
	public static boolean onScroll(double amount) {
		if (!active()) {
			return false;
		}
		scrollBonus = Math.max(1.0 - CompanionConfig.num("zoomFactor"), Math.min(40.0, scrollBonus + amount));
		return true;
	}

	public static float applyFov(float fov, float partialTick) {
		double factor = previous + (current - previous) * partialTick;
		if (factor <= 1.0001) {
			return fov;
		}
		return (float) (fov / factor);
	}

	/** Mouse sensitivity scales down while zoomed so aiming stays steady. */
	public static double sensitivityScale() {
		return current <= 1.0001 ? 1.0 : 1.0 / current;
	}
}
