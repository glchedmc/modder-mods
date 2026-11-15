package mc.glched.glasscompanion.modules;

import mc.glched.glasscompanion.CompanionConfig;
import mc.glched.glasscompanion.GlassCompanion;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.util.Mth;

/** Lunar-style Freelook: hold the key (Left Alt) to orbit the camera without turning your player. */
public final class Freelook {
	private static boolean active;
	private static float yaw;
	private static float pitch;
	private static CameraType previous;

	private Freelook() {
	}

	public static boolean active() {
		return active;
	}

	public static float yaw() {
		return yaw;
	}

	public static float pitch() {
		return pitch;
	}

	public static void tick(Minecraft mc) {
		boolean want = CompanionConfig.module("freelook") && GlassCompanion.freelookKey != null && GlassCompanion.freelookKey.isDown()
				&& mc.player != null && mc.gui.screen() == null;
		if (want && !active) {
			active = true;
			yaw = mc.player.getYRot();
			pitch = mc.player.getXRot();
			previous = mc.options.getCameraType();
			if (previous.isFirstPerson()) {
				mc.options.setCameraType(CameraType.THIRD_PERSON_BACK);
			}
		} else if (!want && active) {
			active = false;
			if (previous != null) {
				mc.options.setCameraType(previous);
			}
		}
	}

	/** Mouse movement goes to the free camera instead of the player (same 0.15 factor as Entity.turn). */
	public static void turn(double dx, double dy) {
		yaw += (float) dx * 0.15f;
		pitch = Mth.clamp(pitch + (float) dy * 0.15f, -90f, 90f);
	}
}
