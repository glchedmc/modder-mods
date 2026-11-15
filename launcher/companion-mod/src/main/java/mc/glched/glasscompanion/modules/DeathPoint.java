package mc.glched.glasscompanion.modules;

import java.util.Locale;

import mc.glched.glasscompanion.waypoints.Waypoints;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.Level;

/**
 * Remembers where you died (like Lunar's death waypoint and our Last Light)
 * and shows an arrow and distance until you get back there.
 */
public final class DeathPoint {
	private static final String[] ARROWS = {"↑", "↗", "→", "↘", "↓", "↙", "←", "↖"};
	private static BlockPos point;
	private static ResourceKey<Level> dimension;
	private static boolean wasDead;

	private DeathPoint() {
	}

	public static void tick(Minecraft mc) {
		LocalPlayer p = mc.player;
		if (p == null || mc.level == null) {
			wasDead = false;
			return;
		}
		boolean dead = p.isDeadOrDying();
		if (dead && !wasDead) {
			point = p.blockPosition();
			dimension = mc.level.dimension();
			Waypoints.addDeath(mc, point, dimension.identifier().toString());
		}
		wasDead = dead;
		if (!dead && point != null && mc.level.dimension().equals(dimension) && p.blockPosition().distSqr(point) < 16) {
			point = null;
		}
	}

	public static String label(Minecraft mc, boolean sample) {
		LocalPlayer p = mc.player;
		if (p == null || point == null || p.isDeadOrDying() || mc.level == null) {
			return sample ? "☠ Death point  128 m ↗" : null;
		}
		if (!mc.level.dimension().equals(dimension)) {
			return "☠ Death point in " + dimension.identifier().getPath().replace('_', ' ');
		}
		double dx = point.getX() + 0.5 - p.getX();
		double dz = point.getZ() + 0.5 - p.getZ();
		double dist = Math.sqrt(dx * dx + dz * dz);
		double target = Math.toDegrees(Math.atan2(-dx, dz));
		double rel = ((target - p.getYRot()) % 360 + 540) % 360 - 180;
		String arrow = ARROWS[(int) Math.floorMod(Math.round(rel / 45.0), 8)];
		return String.format(Locale.ROOT, "☠ Death point  %d m %s  (y %d)", Math.round(dist), arrow, point.getY());
	}
}
