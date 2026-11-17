package mc.glched.glasscompanion;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Set;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.BiConsumer;

import org.joml.Matrix3x2fStack;

import mc.glched.glasscompanion.modules.BlockInfo;
import mc.glched.glasscompanion.modules.DeathPoint;
import mc.glched.glasscompanion.modules.ItemCounter;
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
import net.minecraft.world.item.Items;
import net.minecraft.world.phys.Vec3;

/**
 * Lunar-style HUD made of movable elements. Each element measures itself,
 * is placed from the HUD editor's saved position (or its default spot) and
 * records its on-screen bounds so the editor can draw handles and drag it.
 */
public final class HudRenderer {
	private static final DateTimeFormatter CLOCK = DateTimeFormatter.ofPattern("h:mm a", Locale.ROOT);
	private static final EquipmentSlot[] ARMOR = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};
	private static final String[] DIRS = {"S", "SW", "W", "NW", "N", "NE", "E", "SE"};

	/** Element id → display name, default position (fractions), in draw order. */
	public static final Map<String, String> ELEMENTS = new LinkedHashMap<>();
	private static final Map<String, float[]> DEFAULTS = new LinkedHashMap<>();
	/** Last frame's on-screen bounds in GUI pixels: x, y, w, h. */
	public static final Map<String, int[]> BOUNDS = new LinkedHashMap<>();
	/** True while the HUD editor is open: empty elements show sample content. */
	public static boolean editing;

	static {
		element("info", "Info", 0f, 0f);
		element("armor", "Armor", 1f, 0.5f);
		element("keystrokes", "Keystrokes", 0f, 0.82f);
		element("blockInfo", "Block info", 0.5f, 0.02f);
		element("deathPoint", "Death point", 0.5f, 0.16f);
		element("itemCounter", "Held item", 0.735f, 0.985f);
		// Module overlays drawn by their own HUD layers (or by vanilla / Corner Atlas). Until moved they stay
		// exactly where they always were; once moved they draw at the saved spot and scale (see anchor()).
		element("effectTimers", "Effect timers", 1f, 0f);
		element("echoRing", "Sound arrows", 0.5f, 0.5f);
		element("subtitles", "Subtitles", 1f, 0.85f);
		element("minimap", "Corner Atlas map", 0f, 0f);
	}

	/** Elements placed relative to another renderer's own spot: no global HUD scale until the user resizes them. */
	public static final Set<String> ANCHORED = Set.of("effectTimers", "echoRing", "subtitles", "minimap");

	private static void element(String id, String name, float fx, float fy) {
		ELEMENTS.put(id, name);
		DEFAULTS.put(id, new float[] {fx, fy});
	}

	private HudRenderer() {
	}

	public static float scale() {
		return (float) Math.max(0.5, Math.min(2.0, CompanionConfig.num("hudScale")));
	}

	static void extract(GuiGraphicsExtractor g, DeltaTracker delta) {
		Minecraft mc = Minecraft.getInstance();
		LocalPlayer player = mc.player;
		if (player == null || mc.getDebugOverlay().showDebugScreen()) {
			return;
		}
		float scale = 1f;
		int screenW = 0, screenH = 0;
		Font font = mc.font;
		int color = CompanionConfig.color("hudColor");
		boolean bg = CompanionConfig.bool("hudBackground");

		// Info column (text lines, then potion effects).
		List<String[]> lines = infoLines(mc, player);
		if (!lines.isEmpty()) {
			int w = 0;
			for (String[] l : lines) {
				w = Math.max(w, font.width(l[0]) + 8);
			}
			int h = lines.size() * (font.lineHeight + 6) - 2;
			final int width = w;
			place(g, "info", screenW, screenH, w, h, scale, (x, y) -> {
				int yy = y;
				for (String[] l : lines) {
					if (bg) {
						panel(g, x, yy, x + font.width(l[0]) + 8, yy + font.lineHeight + 4);
					}
					int c = l.length > 1 ? (int) Long.parseLong(l[1], 16) : color;
					g.text(font, l[0], x + 4, yy + 2, c, !bg);
					yy += font.lineHeight + 6;
				}
			});
		}

		if (CompanionConfig.bool("armorHud")) {
			drawArmor(g, player, font, color, bg, screenW, screenH, scale);
		}

		if (CompanionConfig.bool("keystrokes")) {
			place(g, "keystrokes", screenW, screenH, 58, 70, scale, (x, y) -> drawKeystrokes(g, mc, x, y));
		}

		if (CompanionConfig.module("blockInfo")) {
			BlockInfo.Card card = BlockInfo.current(mc, editing);
			if (card != null) {
				int w = Math.max(font.width(card.name()), Math.max(font.width(card.line2()), font.width(card.line3()))) + 30;
				int h = 3 * (font.lineHeight + 1) + 6;
				place(g, "blockInfo", screenW, screenH, w, h, scale, (x, y) -> {
					glassCard(g, x, y, x + w, y + h);
					g.item(card.icon(), x + 5, y + (h - 16) / 2);
					g.text(font, card.name(), x + 25, y + 4, 0xFFFFFFFF, false);
					g.text(font, card.line2(), x + 25, y + 4 + font.lineHeight + 1, 0xFFB8C4E6, false);
					g.text(font, card.line3(), x + 25, y + 4 + 2 * (font.lineHeight + 1), card.line3Color(), false);
				});
			}
		}

		if (CompanionConfig.module("deathPoint")) {
			String label = DeathPoint.label(mc, editing);
			if (label != null) {
				int w = font.width(label) + 12;
				int h = font.lineHeight + 6;
				place(g, "deathPoint", screenW, screenH, w, h, scale, (x, y) -> {
					glassCard(g, x, y, x + w, y + h);
					g.text(font, label, x + 6, y + 3, 0xFFFFB3C0, false);
				});
			}
		}

		if (CompanionConfig.module("itemCounter")) {
			ItemCounter.Count count = ItemCounter.current(player, editing);
			if (count != null) {
				// "342" for blocks and other stacks, arrows for bows; tools also get durability left.
				String n = count.total() >= 0 ? String.valueOf(count.total()) : "";
				String dur = count.durability() >= 0 && CompanionConfig.bool("itemCounterDurability")
						? (CompanionConfig.string("armorHudStyle").equals("percent") ? Math.round(100f * count.durability() / count.maxDurability()) + "%" : String.valueOf(count.durability()))
						: "";
				int durColor = count.durability() < 0 ? color : count.durability() > count.maxDurability() / 2 ? 0xFF5BE49B : count.durability() > count.maxDurability() / 5 ? 0xFFFFD36B : 0xFFFF6B7D;
				if (!n.isEmpty() || !dur.isEmpty()) {
					int tw = Math.max(font.width(n), font.width(dur));
					boolean two = !n.isEmpty() && !dur.isEmpty();
					int w = 24 + tw;
					int h = two ? 2 * font.lineHeight + 6 : 18;
					place(g, "itemCounter", screenW, screenH, w, h, scale, (x, y) -> {
						if (bg) {
							panel(g, x, y, x + w, y + h);
						}
						g.item(count.icon(), x + 2, y + (h - 16) / 2);
						if (two) {
							g.text(font, n, x + 21, y + 3, color, !bg);
							g.text(font, dur, x + 21, y + 4 + font.lineHeight, durColor, !bg);
						} else {
							g.text(font, n.isEmpty() ? dur : n, x + 21, y + 5, n.isEmpty() ? durColor : color, !bg);
						}
						if (count.durability() >= 0) {
							float frac = count.durability() / (float) count.maxDurability();
							g.fill(x + 2, y + h - 2, x + 18, y + h - 1, 0xC0101010);
							g.fill(x + 2, y + h - 2, x + 2 + Math.max(1, Math.round(16 * frac)), y + h - 1, durColor);
						}
					});
				}
			}
		}
	}

	private static List<String[]> infoLines(Minecraft mc, LocalPlayer player) {
		List<String[]> lines = new ArrayList<>();
		if (CompanionConfig.bool("fpsHud")) {
			lines.add(new String[] {mc.getFps() + " FPS"});
		}
		if (CompanionConfig.bool("cpsHud")) {
			lines.add(new String[] {ClickTracker.left() + " | " + ClickTracker.right() + " CPS"});
		}
		if (CompanionConfig.bool("coordinates")) {
			BlockPos p = player.blockPosition();
			lines.add(new String[] {String.format(Locale.ROOT, "XYZ %d %d %d", p.getX(), p.getY(), p.getZ())});
			float yaw = ((player.getYRot() % 360) + 360) % 360;
			lines.add(new String[] {"Facing " + DIRS[Math.round(yaw / 45f) & 7] + " (" + player.getDirection().getName() + ")"});
		}
		if (CompanionConfig.bool("biomeHud") && mc.level != null) {
			mc.level.getBiome(player.blockPosition()).unwrapKey()
					.ifPresent(k -> lines.add(new String[] {"Biome " + prettify(k.identifier().getPath())}));
		}
		if (CompanionConfig.bool("speedHud")) {
			Vec3 v = player.getDeltaMovement();
			lines.add(new String[] {String.format(Locale.ROOT, "%.2f m/s", Math.sqrt(v.x * v.x + v.z * v.z) * 20.0)});
		}
		if (CompanionConfig.bool("pingHud") && mc.getConnection() != null) {
			PlayerInfo info = mc.getConnection().getPlayerInfo(player.getUUID());
			if (info != null) {
				lines.add(new String[] {info.getLatency() + " ms"});
			}
		}
		if (CompanionConfig.bool("serverHud")) {
			ServerData server = mc.getCurrentServer();
			lines.add(new String[] {server != null ? server.ip : "Singleplayer"});
		}
		if (CompanionConfig.bool("clockHud")) {
			lines.add(new String[] {LocalTime.now().format(CLOCK)});
		}
		if (CompanionConfig.bool("memoryHud")) {
			Runtime rt = Runtime.getRuntime();
			long used = (rt.totalMemory() - rt.freeMemory()) / 1048576L;
			lines.add(new String[] {used + " / " + rt.maxMemory() / 1048576L + " MB"});
		}
		if (CompanionConfig.bool("saturationHud")) {
			lines.add(new String[] {String.format(Locale.ROOT, "Saturation %.1f", player.getFoodData().getSaturationLevel()), "FFFFD36B"});
		}
		if (CompanionConfig.bool("dayCounter") && mc.level != null) {
			lines.add(new String[] {"Day " + (mc.level.getOverworldClockTime() / 24000L + 1)});
		}
		if (CompanionConfig.bool("potionHud")) {
			for (MobEffectInstance effect : player.getActiveEffects()) {
				String name = effect.getEffect().value().getDisplayName().getString();
				int amp = effect.getAmplifier();
				String label = name + (amp > 0 ? " " + (amp + 1) : "") + "  " + (effect.isInfiniteDuration() ? "∞" : formatTicks(effect.getDuration()));
				boolean low = effect.getDuration() < 200 && !effect.isInfiniteDuration();
				lines.add(low ? new String[] {label, "FFFF8A8A"} : new String[] {label});
			}
		}
		return lines;
	}

	/** First HUD layer each frame: forget last frame's element bounds. */
	public static void beginFrame(GuiGraphicsExtractor g, DeltaTracker delta) {
		BOUNDS.clear();
	}

	/** Scale an element starts from before its own editor scale: the HUD scale, or 1 for anchored overlays. */
	public static float baseScale(String id) {
		return ANCHORED.contains(id) ? 1f : scale();
	}

	/** Effective scale of one element: its base scale times its own editor scale. */
	public static float scaleOf(String id) {
		return baseScale(id) * CompanionConfig.elementScale(id);
	}

	/**
	 * For overlays drawn by another layer at a fixed spot (defX, defY, w, h in GUI pixels).
	 * Not moved yet: records those bounds for the editor and leaves drawing untouched (returns false).
	 * Moved: pushes a pose that maps the default box onto the saved spot and scale, records the new
	 * bounds and returns true; the caller pops the pose after drawing.
	 */
	public static boolean anchor(GuiGraphicsExtractor g, String id, int defX, int defY, int w, int h, boolean record) {
		float[] f = CompanionConfig.layout(id);
		if (f == null) {
			if (record) {
				BOUNDS.put(id, new int[] {defX, defY, w, h});
			}
			return false;
		}
		float s = scaleOf(id);
		int[] p = position(f, w, h, g.guiWidth(), g.guiHeight(), s);
		Matrix3x2fStack pose = g.pose();
		pose.pushMatrix();
		pose.scale(s, s);
		pose.translate(p[0] - defX, p[1] - defY);
		if (record) {
			BOUNDS.put(id, new int[] {Math.round(p[0] * s), Math.round(p[1] * s), Math.round(w * s), Math.round(h * s)});
		}
		return true;
	}

	/** Top-left (in element units) for saved fractions f of an element w×h drawn at scale s on a guiW×guiH screen. */
	public static int[] position(float[] f, int w, int h, int guiW, int guiH, float s) {
		int screenW = (int) (guiW / s);
		int screenH = (int) (guiH / s);
		return new int[] {Math.round(2 + f[0] * Math.max(0, screenW - w - 4)), Math.round(2 + f[1] * Math.max(0, screenH - h - 4))};
	}

	/**
	 * Positions an element from its saved fractions (or default) and draws it at
	 * its own scale. w and h are the element's unscaled size; the draw callback
	 * works in unscaled element coordinates.
	 */
	private static void place(GuiGraphicsExtractor g, String id, int unusedW, int unusedH, int w, int h, float unusedScale, BiConsumer<Integer, Integer> draw) {
		float s = scaleOf(id);
		float[] f = CompanionConfig.layout(id);
		if (f == null) {
			f = DEFAULTS.get(id);
		}
		int[] p = position(f, w, h, g.guiWidth(), g.guiHeight(), s);
		int x = p[0];
		int y = p[1];
		Matrix3x2fStack pose = g.pose();
		pose.pushMatrix();
		pose.scale(s, s);
		draw.accept(x, y);
		pose.popMatrix();
		BOUNDS.put(id, new int[] {Math.round(x * s), Math.round(y * s), Math.round(w * s), Math.round(h * s)});
	}

	/**
	 * Converts an on-screen top-left (GUI pixels) into saved fractions for an
	 * element whose on-screen size is w×h at scale s.
	 */
	public static float[] toFractions(String id, int guiX, int guiY, int w, int h, int guiW, int guiH, float s) {
		float sw = guiW / s;
		float sh = guiH / s;
		float ew = w / s;
		float eh = h / s;
		float fx = (guiX / s - 2) / Math.max(1f, sw - ew - 4);
		float fy = (guiY / s - 2) / Math.max(1f, sh - eh - 4);
		return new float[] {Math.max(0, Math.min(1, fx)), Math.max(0, Math.min(1, fy)), s / baseScale(id)};
	}

	/**
	 * Armor status (Lunar's Armor Status): each worn piece plus main hand and
	 * offhand, with durability as a number, percent or bar that turns gold
	 * under 50% and red under 20%. Vertical or horizontal; draggable.
	 */
	private static void drawArmor(GuiGraphicsExtractor g, LocalPlayer player, Font font, int color, boolean bg, int screenW, int screenH, float scale) {
		List<ItemStack> stacks = new ArrayList<>();
		for (EquipmentSlot slot : ARMOR) {
			if (!player.getItemBySlot(slot).isEmpty()) {
				stacks.add(player.getItemBySlot(slot));
			}
		}
		if (!player.getMainHandItem().isEmpty()) {
			stacks.add(player.getMainHandItem());
		}
		if (!player.getOffhandItem().isEmpty()) {
			stacks.add(player.getOffhandItem());
		}
		if (stacks.isEmpty() && editing) {
			ItemStack helm = new ItemStack(Items.DIAMOND_HELMET);
			helm.setDamageValue(helm.getMaxDamage() * 3 / 4);
			stacks.add(helm);
			stacks.add(new ItemStack(Items.DIAMOND_CHESTPLATE));
			stacks.add(new ItemStack(Items.DIAMOND_SWORD));
			stacks.add(new ItemStack(Items.TORCH, 48));
		}
		if (stacks.isEmpty()) {
			return;
		}
		String style = CompanionConfig.string("armorHudStyle");
		boolean bar = style.equals("bar");
		boolean horizontal = CompanionConfig.string("armorHudLayout").equals("horizontal");
		int tw = 0;
		for (ItemStack s : stacks) {
			tw = Math.max(tw, font.width(durText(s, style)));
		}
		final int textW = tw;
		if (horizontal) {
			int cell = Math.max(20, textW + 4);
			int w = stacks.size() * cell;
			int h = bar ? 21 : 18 + font.lineHeight + 1;
			place(g, "armor", screenW, screenH, w, h, scale, (x, y) -> {
				if (bg) {
					panel(g, x, y, x + w, y + h);
				}
				int cx = x;
				for (ItemStack stack : stacks) {
					g.item(stack, cx + (cell - 16) / 2, y + 1);
					if (bar) {
						durBar(g, stack, cx + (cell - 16) / 2, y + 18);
					} else {
						String dur = durText(stack, style);
						g.text(font, dur, cx + (cell - font.width(dur)) / 2, y + 18, durColor(stack, color), !bg);
					}
					cx += cell;
				}
			});
		} else {
			int w = bar ? 22 : textW + 24;
			int h = stacks.size() * 19 - 1;
			place(g, "armor", screenW, screenH, w, h, scale, (x, y) -> {
				int ay = y;
				for (ItemStack stack : stacks) {
					if (bg) {
						panel(g, x, ay, x + w, ay + 18);
					}
					g.item(stack, x + w - 18, ay + 1);
					if (bar) {
						durBar(g, stack, x + w - 18, ay + 16);
					} else {
						String dur = durText(stack, style);
						g.text(font, dur, x + 3 + textW - font.width(dur), ay + 5, durColor(stack, color), !bg);
					}
					ay += 19;
				}
			});
		}
	}

	private static float durFraction(ItemStack stack) {
		return stack.isDamageableItem() ? 1f - stack.getDamageValue() / (float) stack.getMaxDamage() : 1f;
	}

	private static int durColor(ItemStack stack, int normal) {
		float frac = durFraction(stack);
		return frac > 0.5f ? normal : frac > 0.2f ? 0xFFFFD36B : 0xFFFF6B7D;
	}

	private static void durBar(GuiGraphicsExtractor g, ItemStack stack, int x, int y) {
		if (!stack.isDamageableItem()) {
			return;
		}
		float frac = durFraction(stack);
		g.fill(x, y, x + 16, y + 2, 0xC0101010);
		g.fill(x, y, x + Math.max(1, Math.round(16 * frac)), y + 2, durColor(stack, 0xFF5BE49B));
	}

	private static String durText(ItemStack stack, String style) {
		if (!stack.isDamageableItem()) {
			return stack.getCount() > 1 ? String.valueOf(stack.getCount()) : "";
		}
		int left = stack.getMaxDamage() - stack.getDamageValue();
		return style.equals("percent") ? Math.round(100f * left / stack.getMaxDamage()) + "%" : String.valueOf(left);
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
	static void panel(GuiGraphicsExtractor g, int x1, int y1, int x2, int y2) {
		g.fill(x1, y1, x2, y2, 0x70141836);
		g.fill(x1, y1, x2, y1 + 1, 0x40FFFFFF);
	}

	/** Slightly stronger card used by module readouts (block info, death point). */
	static void glassCard(GuiGraphicsExtractor g, int x1, int y1, int x2, int y2) {
		Glass.panel(g, x1, y1, x2, y2, 0.85f);
	}

	private static String formatTicks(int ticks) {
		int sec = ticks / 20;
		return String.format(Locale.ROOT, "%d:%02d", sec / 60, sec % 60);
	}

	public static String prettify(String id) {
		StringBuilder b = new StringBuilder();
		for (String part : id.split("_")) {
			if (!part.isEmpty()) {
				b.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1)).append(' ');
			}
		}
		return b.toString().trim();
	}
}
