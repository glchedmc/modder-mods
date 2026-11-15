package mc.glched.glasscompanion.modules;

import java.util.ArrayList;
import java.util.List;

import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientChunkCache;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.gizmos.Gizmos;
import net.minecraft.util.ARGB;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

import it.unimi.dsi.fastutil.longs.LongOpenHashSet;

/**
 * World-space chunk lines, drawn the same way as {@code ChunkBorderRenderer}
 * in 26.3: {@link Gizmos#line(Vec3, Vec3, int, float)}.
 */
final class ChunkBorderLines {
	private static final float THICK_WIDTH = 4.0F;
	private static final float MEDIUM_WIDTH = 2.5F;
	private static final float THIN_WIDTH = 1.0F;

	/** Vanilla current-chunk corner / section-ring color. */
	private static final int CURRENT_CORNER = ARGB.colorFromFloat(1.0F, 0.25F, 0.25F, 1.0F);
	/** Vanilla face-grid major (every 4 or 8). */
	private static final int CELL_BORDER = ARGB.color(255, 0, 155, 155);
	/** Vanilla face-grid minor. */
	private static final int GRID_MINOR = ARGB.color(255, 255, 255, 0);
	/** Fainter marks at 16-block section heights. */
	private static final int SECTION_MARK = ARGB.colorFromFloat(0.45F, 0.55F, 0.9F, 1.0F);
	/** Neighbouring chunk borders in the loaded-area mode. */
	private static final int NEIGHBOR_BORDER = ARGB.colorFromFloat(0.85F, 0.2F, 1.0F, 0.35F);
	/** Outer edge of the client's actually loaded chunk area. */
	private static final int LOADED_EDGE = ARGB.colorFromFloat(0.9F, 1.0F, 0.55F, 0.15F);

	private static final int[][] NEIGHBOR_OFFSETS = {
			{-1, -1}, {0, -1}, {1, -1},
			{-1, 0}, {1, 0},
			{-1, 1}, {0, 1}, {1, 1}
	};

	private final List<Line> loadedLines = new ArrayList<>();
	private long lastLoadedKey = Long.MIN_VALUE;

	void clearCache() {
		loadedLines.clear();
		lastLoadedKey = Long.MIN_VALUE;
	}

	void emit(Minecraft client, ChunkBorders.Mode mode) {
		if (mode == ChunkBorders.Mode.OFF) {
			return;
		}
		ClientLevel level = client.level;
		Entity camera = client.getCameraEntity();
		if (level == null || camera == null) {
			return;
		}

		ChunkPos chunk = camera.chunkPosition();
		int minY = level.getMinY();
		int maxY = level.getMaxY() + 1;

		emitCurrentChunk(chunk, minY, maxY);
		if (mode == ChunkBorders.Mode.LOADED) {
			emitNeighborBorders(level, chunk, minY, maxY);
			for (Line line : loadedLines) {
				Gizmos.line(line.from, line.to, line.color, line.width);
			}
		}
	}

	void refreshLoadedCache(Minecraft client) {
		ClientLevel level = client.level;
		Entity camera = client.getCameraEntity();
		if (level == null || camera == null) {
			clearCache();
			return;
		}

		ClientChunkCache cache = level.getChunkSource();
		ChunkPos origin = camera.chunkPosition();
		int radius = Math.max(2, client.options.getEffectiveRenderDistance()) + 3;
		int minY = level.getMinY();
		int maxY = level.getMaxY() + 1;
		int loadedCount = cache.getLoadedChunksCount();
		long key = ChunkPos.pack(origin.x(), origin.z()) ^ ((long) radius << 32) ^ ((long) loadedCount << 16) ^ minY ^ ((long) maxY << 8);
		if (key == lastLoadedKey && !loadedLines.isEmpty()) {
			return;
		}

		LongOpenHashSet loaded = new LongOpenHashSet(Math.max(16, loadedCount * 2));
		for (int x = origin.x() - radius; x <= origin.x() + radius; x++) {
			for (int z = origin.z() - radius; z <= origin.z() + radius; z++) {
				if (cache.getChunkNow(x, z) != null) {
					loaded.add(ChunkPos.pack(x, z));
				}
			}
		}

		loadedLines.clear();
		int[][] dirs = {{0, -1}, {1, 0}, {0, 1}, {-1, 0}};
		for (long packed : loaded) {
			ChunkPos pos = ChunkPos.unpack(packed);
			for (int[] dir : dirs) {
				if (!loaded.contains(ChunkPos.pack(pos.x() + dir[0], pos.z() + dir[1]))) {
					addExposedEdge(pos, dir[0], dir[1], minY, maxY);
				}
			}
		}
		lastLoadedKey = key;
	}

	/**
	 * Current-chunk corners, face grid, and faint 16-block section-height marks,
	 * following the same line style as vanilla's {@code ChunkBorderRenderer}.
	 */
	private static void emitCurrentChunk(ChunkPos chunk, int minY, int maxY) {
		double minX = chunk.getMinBlockX();
		double minZ = chunk.getMinBlockZ();
		double maxX = minX + 16.0;
		double maxZ = minZ + 16.0;
		double y0 = minY;
		double y1 = maxY;

		// Thick verticals at the four corners.
		line(minX, y0, minZ, minX, y1, minZ, CURRENT_CORNER, THICK_WIDTH);
		line(maxX, y0, minZ, maxX, y1, minZ, CURRENT_CORNER, THICK_WIDTH);
		line(minX, y0, maxZ, minX, y1, maxZ, CURRENT_CORNER, THICK_WIDTH);
		line(maxX, y0, maxZ, maxX, y1, maxZ, CURRENT_CORNER, THICK_WIDTH);

		// Vertical grid on the four faces, every 2 blocks (major every 4), like vanilla.
		for (int i = 2; i < 16; i += 2) {
			int color = (i % 4 == 0) ? CELL_BORDER : GRID_MINOR;
			line(minX + i, y0, minZ, minX + i, y1, minZ, color, THIN_WIDTH);
			line(minX + i, y0, maxZ, minX + i, y1, maxZ, color, THIN_WIDTH);
			line(minX, y0, minZ + i, minX, y1, minZ + i, color, THIN_WIDTH);
			line(maxX, y0, minZ + i, maxX, y1, minZ + i, color, THIN_WIDTH);
		}

		// Horizontal grid on the four faces, every 2 blocks (major every 8), like vanilla.
		for (int y = minY; y <= maxY; y += 2) {
			int color = (y % 8 == 0) ? CELL_BORDER : GRID_MINOR;
			ring(minX, maxX, minZ, maxZ, y, color, THIN_WIDTH);
		}

		// Faint marks at 16-block section heights.
		for (int y = minY; y <= maxY; y += 16) {
			ring(minX, maxX, minZ, maxZ, y, SECTION_MARK, MEDIUM_WIDTH);
		}
	}

	private static void emitNeighborBorders(Level level, ChunkPos origin, int minY, int maxY) {
		ClientChunkCache cache = ((ClientLevel) level).getChunkSource();
		for (int[] offset : NEIGHBOR_OFFSETS) {
			int cx = origin.x() + offset[0];
			int cz = origin.z() + offset[1];
			if (cache.getChunkNow(cx, cz) == null) {
				continue;
			}
			ChunkPos neighbor = new ChunkPos(cx, cz);
			double minX = neighbor.getMinBlockX();
			double minZ = neighbor.getMinBlockZ();
			double maxX = minX + 16.0;
			double maxZ = minZ + 16.0;
			double y0 = minY;
			double y1 = maxY;
			line(minX, y0, minZ, minX, y1, minZ, NEIGHBOR_BORDER, MEDIUM_WIDTH);
			line(maxX, y0, minZ, maxX, y1, minZ, NEIGHBOR_BORDER, MEDIUM_WIDTH);
			line(minX, y0, maxZ, minX, y1, maxZ, NEIGHBOR_BORDER, MEDIUM_WIDTH);
			line(maxX, y0, maxZ, maxX, y1, maxZ, NEIGHBOR_BORDER, MEDIUM_WIDTH);
			ring(minX, maxX, minZ, maxZ, minY, NEIGHBOR_BORDER, MEDIUM_WIDTH);
			ring(minX, maxX, minZ, maxZ, maxY, NEIGHBOR_BORDER, MEDIUM_WIDTH);
		}
	}

	private void addExposedEdge(ChunkPos pos, int dx, int dz, int minY, int maxY) {
		double minX = pos.getMinBlockX();
		double minZ = pos.getMinBlockZ();
		double maxX = minX + 16.0;
		double maxZ = minZ + 16.0;
		double x1, z1, x2, z2;
		if (dz == -1) {
			x1 = minX;
			z1 = minZ;
			x2 = maxX;
			z2 = minZ;
		} else if (dz == 1) {
			x1 = minX;
			z1 = maxZ;
			x2 = maxX;
			z2 = maxZ;
		} else if (dx == -1) {
			x1 = minX;
			z1 = minZ;
			x2 = minX;
			z2 = maxZ;
		} else {
			x1 = maxX;
			z1 = minZ;
			x2 = maxX;
			z2 = maxZ;
		}

		push(x1, minY, z1, x1, maxY, z1, LOADED_EDGE, THICK_WIDTH);
		push(x2, minY, z2, x2, maxY, z2, LOADED_EDGE, THICK_WIDTH);
		for (int y = minY; y <= maxY; y += 16) {
			push(x1, y, z1, x2, y, z2, LOADED_EDGE, MEDIUM_WIDTH);
		}
		if ((maxY - minY) % 16 != 0) {
			push(x1, maxY, z1, x2, maxY, z2, LOADED_EDGE, MEDIUM_WIDTH);
		}
	}

	private static void ring(double minX, double maxX, double minZ, double maxZ, double y, int color, float width) {
		line(minX, y, minZ, minX, y, maxZ, color, width);
		line(minX, y, maxZ, maxX, y, maxZ, color, width);
		line(maxX, y, maxZ, maxX, y, minZ, color, width);
		line(maxX, y, minZ, minX, y, minZ, color, width);
	}

	private static void line(double x1, double y1, double z1, double x2, double y2, double z2, int color, float width) {
		Gizmos.line(new Vec3(x1, y1, z1), new Vec3(x2, y2, z2), color, width);
	}

	private void push(double x1, double y1, double z1, double x2, double y2, double z2, int color, float width) {
		loadedLines.add(new Line(new Vec3(x1, y1, z1), new Vec3(x2, y2, z2), color, width));
	}

	private record Line(Vec3 from, Vec3 to, int color, float width) {
	}
}
