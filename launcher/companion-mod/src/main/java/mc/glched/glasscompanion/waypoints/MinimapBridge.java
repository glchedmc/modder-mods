package mc.glched.glasscompanion.waypoints;

import java.lang.reflect.Field;

import mc.glched.glasscompanion.GlassCompanion;
import mc.glched.glasscompanion.HudRenderer;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.player.LocalPlayer;

/**
 * Puts waypoint markers on the Corner Atlas minimap when that mod is
 * installed. Corner Atlas has no API, so this reads its live settings
 * (corner, size, zoom, round, north-up) and uses the same projection it
 * uses for its mob dots. Without Corner Atlas this does nothing.
 */
public final class MinimapBridge {
	private static final int RES = 128;
	private static final int MARGIN = 4;
	private static Boolean present;
	private static Field enabled, corner, size, round, northUp, zoom;
	private static double[] zooms;

	private MinimapBridge() {
	}

	public static boolean present() {
		if (present == null) {
			present = false;
			if (FabricLoader.getInstance().isModLoaded("corner-atlas")) {
				try {
					Class<?> c = Class.forName("mc.glched.corneratlas.AtlasConfig");
					enabled = c.getField("enabled");
					corner = c.getField("corner");
					size = c.getField("size");
					round = c.getField("round");
					northUp = c.getField("northUp");
					zoom = c.getField("zoom");
					zooms = (double[]) c.getField("ZOOMS").get(null);
					present = true;
					GlassCompanion.LOGGER.info("[glass-companion] Corner Atlas found: waypoints show on its minimap");
				} catch (ReflectiveOperationException | RuntimeException ex) {
					GlassCompanion.LOGGER.warn("[glass-companion] Corner Atlas is installed but its settings could not be read; no minimap markers", ex);
				}
			}
		}
		return present;
	}

	/**
	 * Corner Atlas's map box in vanilla GUI pixels at its configured corner: x, y, w, h
	 * (map plus the coordinate line under it), or null when the map is off.
	 */
	static int[] mapBox(GuiGraphicsExtractor g) {
		if (!present()) {
			return null;
		}
		try {
			if (!enabled.getBoolean(null)) {
				return null;
			}
			int mapSize = size.getInt(null);
			int c = Math.floorMod(corner.getInt(null), 4);
			int textH = Minecraft.getInstance().font.lineHeight + 1;
			boolean right = c == 1 || c == 3;
			boolean bottom = c >= 2;
			int x = right ? g.guiWidth() - mapSize - MARGIN : MARGIN;
			int y = bottom ? g.guiHeight() - mapSize - MARGIN - textH : MARGIN;
			return new int[] {x, y, mapSize, mapSize + textH};
		} catch (ReflectiveOperationException | RuntimeException ex) {
			return null;
		}
	}

	/**
	 * Runs Corner Atlas's own map drawing, moved and scaled to where the HUD editor put
	 * the "minimap" element (unchanged until it is moved). Corner Atlas itself is not modified.
	 */
	public static void drawMoved(GuiGraphicsExtractor g, Runnable drawMap) {
		Minecraft mc = Minecraft.getInstance();
		int[] box = mc.player == null ? null : mapBox(g);
		boolean moved = box != null && HudRenderer.anchor(g, "minimap", box[0], box[1], box[2], box[3], true);
		try {
			drawMap.run();
		} finally {
			if (moved) {
				g.pose().popMatrix();
			}
		}
	}

	static void draw(GuiGraphicsExtractor g, DeltaTracker delta) {
		int[] box = mapBox(g);
		boolean moved = box != null && HudRenderer.anchor(g, "minimap", box[0], box[1], box[2], box[3], false);
		try {
			drawMarkers(g, delta);
		} finally {
			if (moved) {
				g.pose().popMatrix();
			}
		}
	}

	private static void drawMarkers(GuiGraphicsExtractor g, DeltaTracker delta) {
		if (!present()) {
			return;
		}
		Minecraft mc = Minecraft.getInstance();
		LocalPlayer player = mc.player;
		try {
			if (!enabled.getBoolean(null)) {
				return;
			}
			int mapSize = size.getInt(null);
			boolean isRound = round.getBoolean(null);
			boolean north = northUp.getBoolean(null);
			double bpp = zooms[Math.max(0, Math.min(zooms.length - 1, zoom.getInt(null)))];
			int c = Math.floorMod(corner.getInt(null), 4);
			float partial = delta.getGameTimeDeltaPartialTick(true);
			double px = player.xo + (player.getX() - player.xo) * partial;
			double pz = player.zo + (player.getZ() - player.zo) * partial;
			double rx, rz, fx, fz;
			if (north) {
				rx = 1; rz = 0; fx = 0; fz = -1;
			} else {
				double rad = Math.toRadians(player.getViewYRot(partial));
				fx = -Math.sin(rad);
				fz = Math.cos(rad);
				rx = -Math.cos(rad);
				rz = -Math.sin(rad);
			}
			int textH = mc.font.lineHeight + 1;
			boolean right = c == 1 || c == 3;
			boolean bottom = c >= 2;
			int x = right ? g.guiWidth() - mapSize - MARGIN : MARGIN;
			int y = bottom ? g.guiHeight() - mapSize - MARGIN - textH : MARGIN;
			double scale = mapSize / (double) RES;
			double half = mapSize / 2.0;
			double limit = half - 3;
			for (Waypoints.Waypoint w : Waypoints.visibleHere(mc)) {
				double dx = w.x + 0.5 - px, dz = w.z + 0.5 - pz;
				double sx = (dx * rx + dz * rz) / bpp * scale;
				double sy = -(dx * fx + dz * fz) / bpp * scale;
				boolean edge = false;
				if (isRound) {
					double len = Math.hypot(sx, sy);
					if (len > limit) {
						sx = sx / len * limit;
						sy = sy / len * limit;
						edge = true;
					}
				} else {
					double mx = Math.max(Math.abs(sx), Math.abs(sy));
					if (mx > limit) {
						sx = sx / mx * limit;
						sy = sy / mx * limit;
						edge = true;
					}
				}
				int cx = (int) Math.round(x + half + sx);
				int cy = (int) Math.round(y + half + sy);
				diamond(g, cx, cy, edge ? 2 : 3, w.color | 0xFF000000);
			}
		} catch (IllegalAccessException | RuntimeException ex) {
			present = false;
		}
	}

	/** A small outlined diamond marker. */
	private static void diamond(GuiGraphicsExtractor g, int cx, int cy, int r, int color) {
		for (int i = -r - 1; i <= r + 1; i++) {
			int span = r + 1 - Math.abs(i);
			g.fill(cx - span, cy + i, cx + span + 1, cy + i + 1, 0xFF000000);
		}
		for (int i = -r; i <= r; i++) {
			int span = r - Math.abs(i);
			g.fill(cx - span, cy + i, cx + span + 1, cy + i + 1, color);
		}
	}
}
