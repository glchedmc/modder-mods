package mc.glched.glasscompanion;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.joml.Matrix3x2fStack;

import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;

/** Lunar-style info HUD: a column of glass panels in the top-left, armor at the right, keystrokes bottom-left. */
public final class HudRenderer {
	private static final DateTimeFormatter CLOCK = DateTimeFormatter.ofPattern("h:mm a", Locale.ROOT);
	private static final EquipmentSlot[] ARMOR = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};
	private static final String[] DIRS = {"S", "SW", "W", "NW", "N", "NE", "E", "SE"};

	private HudRenderer() {
	}

	static void extract(GuiGraphicsExtractor g, DeltaTracker delta) {
		Minecraft mc = Minecraft.getInstance();
		LocalPlayer player = mc.player;
		if (player == null || mc.getDebugOverlay().showDebugScreen()) {
			return;
		}
		float scale = (float) Math.max(0.5, Math.min(2.0, CompanionConfig.num("hudScale")));
		Matrix3x2fStack pose = g.pose();
		pose.pushMatrix();
		pose.scale(scale, scale);
		int screenW = (int) (g.guiWidth() / scale);
		int screenH = (int) (g.guiHeight() / scale);

		List<String> lines = new ArrayList<>();
		if (CompanionConfig.bool("fpsHud")) {
			lines.add(mc.getFps() + " FPS");
		}
		if (CompanionConfig.bool("cpsHud")) {
			lines.add(ClickTracker.left() + " | " + ClickTracker.right() + " CPS");
		}
		if (CompanionConfig.bool("coordinates")) {
			BlockPos p = player.blockPosition();
			lines.add(String.format(Locale.ROOT, "XYZ %d %d %d", p.getX(), p.getY(), p.getZ()));
			float yaw = ((player.getYRot() % 360) + 360) % 360;
			lines.add("Facing " + DIRS[Math.round(yaw / 45f) & 7] + " (" + player.getDirection().getName() + ")");
		}
		if (CompanionConfig.bool("biomeHud") && mc.level != null) {
			mc.level.getBiome(player.blockPosition()).unwrapKey()
					.ifPresent(k -> lines.add("Biome " + prettify(k.identifier().getPath())));
		}
		if (CompanionConfig.bool("speedHud")) {
			Vec3 v = player.getDeltaMovement();
			lines.add(String.format(Locale.ROOT, "%.2f m/s", Math.sqrt(v.x * v.x + v.z * v.z) * 20.0));
		}
		if (CompanionConfig.bool("pingHud") && mc.getConnection() != null) {
			PlayerInfo info = mc.getConnection().getPlayerInfo(player.getUUID());
			if (info != null) {
				lines.add(info.getLatency() + " ms");
			}
		}
		if (CompanionConfig.bool("serverHud")) {
			ServerData server = mc.getCurrentServer();
			lines.add(server != null ? server.ip : "Singleplayer");
		}
		if (CompanionConfig.bool("clockHud")) {
			lines.add(LocalTime.now().format(CLOCK));
		}
		if (CompanionConfig.bool("memoryHud")) {
			Runtime rt = Runtime.getRuntime();
			long used = (rt.totalMemory() - rt.freeMemory()) / 1048576L;
			lines.add(used + " / " + rt.maxMemory() / 1048576L + " MB");
		}

		Font font = mc.font;
		int color = CompanionConfig.color("hudColor");
		boolean bg = CompanionConfig.bool("hudBackground");
		int y = 4;
		for (String line : lines) {
			int w = font.width(line);
			if (bg) {
				panel(g, 3, y - 2, 3 + w + 8, y + font.lineHeight + 2);
			}
			g.text(font, line, 7, y, color, !bg);
			y += font.lineHeight + 6;
		}

		if (CompanionConfig.bool("potionHud")) {
			for (MobEffectInstance effect : player.getActiveEffects()) {
				String name = effect.getEffect().value().getDisplayName().getString();
				int amp = effect.getAmplifier();
				String label = name + (amp > 0 ? " " + (amp + 1) : "") + "  " + (effect.isInfiniteDuration() ? "∞" : formatTicks(effect.getDuration()));
				int w = font.width(label);
				if (bg) {
					panel(g, 3, y - 2, 3 + w + 8, y + font.lineHeight + 2);
				}
				g.text(font, label, 7, y, effect.getDuration() < 200 && !effect.isInfiniteDuration() ? 0xFFFF8A8A : color, !bg);
				y += font.lineHeight + 6;
			}
		}

		if (CompanionConfig.bool("armorHud")) {
			int ay = screenH / 2 - 40;
			int ax = screenW - 22;
			List<ItemStack> stacks = new ArrayList<>();
			for (EquipmentSlot slot : ARMOR) {
				stacks.add(player.getItemBySlot(slot));
			}
			stacks.add(player.getMainHandItem());
			for (ItemStack stack : stacks) {
				if (stack.isEmpty()) {
					continue;
				}
				String dur = stack.isDamageableItem() ? String.valueOf(stack.getMaxDamage() - stack.getDamageValue()) : (stack.getCount() > 1 ? String.valueOf(stack.getCount()) : "");
				int tw = font.width(dur);
				if (bg) {
					panel(g, ax - tw - 6, ay - 1, ax + 18, ay + 17);
				}
				g.item(stack, ax, ay);
				if (!dur.isEmpty()) {
					float frac = stack.isDamageableItem() ? 1f - stack.getDamageValue() / (float) stack.getMaxDamage() : 1f;
					int c = frac > 0.5f ? color : frac > 0.2f ? 0xFFFFD36B : 0xFFFF6B7D;
					g.text(font, dur, ax - tw - 2, ay + 5, c, !bg);
				}
				ay += 19;
			}
		}

		if (CompanionConfig.bool("keystrokes")) {
			drawKeystrokes(g, mc, 6, screenH - 70);
		}
		pose.popMatrix();
	}

	private static void drawKeystrokes(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
		var o = mc.options;
		int s = 18;
		key(g, mc, "W", x + s + 2, y, s, s, o.keyUp.isDown());
		key(g, mc, "A", x, y + s + 2, s, s, o.keyLeft.isDown());
		key(g, mc, "S", x + s + 2, y + s + 2, s, s, o.keyDown.isDown());
		key(g, mc, "D", x + 2 * (s + 2), y + s + 2, s, s, o.keyRight.isDown());
		int w = (3 * s + 4 - 2) / 2;
		key(g, mc, "LMB " + ClickTracker.left(), x, y + 2 * (s + 2), w, s, mc.mouseHandler.isLeftPressed());
		key(g, mc, "RMB " + ClickTracker.right(), x + w + 2, y + 2 * (s + 2), w, s, mc.mouseHandler.isRightPressed());
		key(g, mc, "———", x, y + 3 * (s + 2), 3 * s + 4, 10, o.keyJump.isDown());
	}

	private static void key(GuiGraphicsExtractor g, Minecraft mc, String label, int x, int y, int w, int h, boolean down) {
		g.fill(x, y, x + w, y + h, down ? 0xC0FFFFFF : 0x66101530);
		g.fill(x, y, x + w, y + 1, 0x55FFFFFF);
		int tw = mc.font.width(label);
		float sc = tw > w - 2 ? (w - 2f) / tw : 1f;
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(x + w / 2f, y + (h - mc.font.lineHeight * sc) / 2f + 1);
		pose.scale(sc, sc);
		g.text(mc.font, label, -tw / 2, 0, down ? 0xFF101530 : 0xFFFFFFFF, false);
		pose.popMatrix();
	}

	/** Frosted panel: translucent fill with a soft top highlight. */
	private static void panel(GuiGraphicsExtractor g, int x1, int y1, int x2, int y2) {
		g.fill(x1, y1, x2, y2, 0x70141836);
		g.fill(x1, y1, x2, y1 + 1, 0x40FFFFFF);
	}

	private static String formatTicks(int ticks) {
		int sec = ticks / 20;
		return String.format(Locale.ROOT, "%d:%02d", sec / 60, sec % 60);
	}

	private static String prettify(String id) {
		StringBuilder b = new StringBuilder();
		for (String part : id.split("_")) {
			if (!part.isEmpty()) {
				b.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1)).append(' ');
			}
		}
		return b.toString().trim();
	}
}
