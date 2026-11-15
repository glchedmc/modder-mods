package mc.glched.glasscompanion.waypoints;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.joml.Matrix4f;
import org.joml.Vector4f;

import mc.glched.glasscompanion.CompanionConfig;
import mc.glched.glasscompanion.Glass;
import net.minecraft.client.Camera;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.gizmos.GizmoStyle;
import net.minecraft.gizmos.Gizmos;
import net.minecraft.util.ARGB;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Beacon-style beams in the world (gizmo cuboids, like Lunar's waypoint beams)
 * and screen-space name + distance labels that stay readable at any range.
 */
public final class WaypointRenderer {
	private WaypointRenderer() {
	}

	/** World pass: one translucent column per waypoint, from the waypoint up to the build limit. */
	public static void emitWorld() {
		Minecraft mc = Minecraft.getInstance();
		if (!Waypoints.active() || !CompanionConfig.bool("waypointBeams") || mc.level == null || mc.player == null) {
			return;
		}
		Vec3 cam = mc.gameRenderer.mainCamera().position();
		double maxD = Math.max(32, mc.options.getEffectiveRenderDistance() * 16 - 12);
		int top = mc.level.getMaxY() + 1;
		for (Waypoints.Waypoint w : Waypoints.visibleHere(mc)) {
			double cx = w.x + 0.5, cz = w.z + 0.5;
			double dx = cx - cam.x, dz = cz - cam.z;
			double dist = Math.sqrt(dx * dx + dz * dz);
			double baseY = w.y;
			if (dist > maxD) {
				// Past render distance the real spot is clipped: draw the beam at the edge, in the same direction.
				cx = cam.x + dx / dist * maxD;
				cz = cam.z + dz / dist * maxD;
				baseY = Math.min(w.y, cam.y - 32);
			}
			if (dist < 1.2) {
				continue;
			}
			// Beams get a little wider with distance so they stay visible.
			double half = Math.min(1.2, 0.18 + dist / 220.0);
			int rgb = w.color & 0xFFFFFF;
			Gizmos.cuboid(new AABB(cx - half, baseY, cz - half, cx + half, top, cz + half), GizmoStyle.fill(ARGB.color(70, rgb)));
			double core = half * 0.4;
			Gizmos.cuboid(new AABB(cx - core, baseY, cz - core, cx + core, top, cz + core), GizmoStyle.fill(ARGB.color(150, rgb)));
			if (dist <= maxD) {
				Gizmos.cuboid(new AABB(w.x, w.y, w.z, w.x + 1, w.y + 1, w.z + 1), GizmoStyle.stroke(ARGB.color(230, rgb), 2.5f));
			}
		}
	}

	private record Label(String name, String dist, int color, float sx, float sy, double d) {
	}

	/** HUD pass: projects each waypoint onto the screen and draws a glass tag with its name and distance. */
	public static void extractHud(GuiGraphicsExtractor g, DeltaTracker delta) {
		Minecraft mc = Minecraft.getInstance();
		if (!Waypoints.active() || mc.level == null || mc.player == null || mc.getDebugOverlay().showDebugScreen()) {
			return;
		}
		if (CompanionConfig.bool("waypointLabels")) {
			drawLabels(g, mc);
		}
	}

	/** Drawn right after Corner Atlas's minimap element so the markers sit on top of the map. */
	public static void extractMinimap(GuiGraphicsExtractor g, DeltaTracker delta) {
		Minecraft mc = Minecraft.getInstance();
		if (!Waypoints.active() || !CompanionConfig.bool("waypointMinimap") || mc.level == null || mc.player == null) {
			return;
		}
		MinimapBridge.draw(g, delta);
	}

	private static void drawLabels(GuiGraphicsExtractor g, Minecraft mc) {
		Camera camera = mc.gameRenderer.mainCamera();
		Vec3 cam = camera.position();
		Matrix4f m = camera.getViewRotationProjectionMatrix(new Matrix4f());
		int gw = g.guiWidth(), gh = g.guiHeight();
		Font font = mc.font;
		List<Label> labels = new ArrayList<>();
		for (Waypoints.Waypoint w : Waypoints.visibleHere(mc)) {
			double dx = w.x + 0.5 - cam.x, dy = w.y + 1.6 - cam.y, dz = w.z + 0.5 - cam.z;
			double d = Math.sqrt(dx * dx + dy * dy + dz * dz);
			if (d < 1.5) {
				continue;
			}
			Vector4f v = new Vector4f((float) dx, (float) dy, (float) dz, 1f).mul(m);
			if (v.w <= 0.05f) {
				continue;
			}
			float nx = v.x / v.w, ny = v.y / v.w;
			if (Math.abs(nx) > 1.1f || Math.abs(ny) > 1.1f) {
				continue;
			}
			float sx = (nx * 0.5f + 0.5f) * gw;
			float sy = (1f - (ny * 0.5f + 0.5f)) * gh;
			labels.add(new Label(w.name, formatDistance(d), w.color, sx, sy, d));
		}
		// Far first so the nearest tag ends up on top.
		labels.sort((a, b) -> Double.compare(b.d, a.d));
		for (Label l : labels) {
			int tw = Math.max(font.width(l.name), font.width(l.dist));
			int x1 = Math.round(l.sx) - tw / 2 - 5;
			int y1 = Math.round(l.sy) - font.lineHeight * 2 - 6;
			int x2 = x1 + tw + 10;
			int y2 = y1 + font.lineHeight * 2 + 5;
			Glass.panel(g, x1, y1, x2, y2, 0.8f, 0x10142E, 4);
			g.fill(x1 + 3, y1 + 2, x1 + 5, y2 - 2, l.color | 0xFF000000);
			g.centeredText(font, l.name, x1 + (x2 - x1) / 2 + 1, y1 + 3, 0xFFFFFFFF);
			g.centeredText(font, l.dist, x1 + (x2 - x1) / 2 + 1, y1 + 3 + font.lineHeight + 1, 0xFFC8D2F0);
			// Little pointer under the tag.
			int px = Math.round(l.sx);
			g.fill(px - 2, y2, px + 3, y2 + 1, 0xA0FFFFFF);
			g.fill(px - 1, y2 + 1, px + 2, y2 + 2, 0xA0FFFFFF);
			g.fill(px, y2 + 2, px + 1, y2 + 3, 0xA0FFFFFF);
		}
	}

	public static String formatDistance(double d) {
		return d >= 10000 ? String.format(Locale.ROOT, "%.1f km", d / 1000) : Math.round(d) + " m";
	}
}
