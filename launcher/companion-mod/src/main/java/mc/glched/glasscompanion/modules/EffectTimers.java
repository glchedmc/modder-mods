package mc.glched.glasscompanion.modules;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import mc.glched.glasscompanion.CompanionConfig;
import mc.glched.glasscompanion.HudRenderer;
import net.minecraft.client.gui.Hud;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.resources.Identifier;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.core.Holder;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;

import com.google.common.collect.Ordering;

import org.joml.Matrix3x2fStack;

/**
 * From Brew Clock: a time-left bar and m:ss label on every vanilla status-effect icon.
 * A movable HUD element ("effectTimers"): until it is moved it decorates vanilla's icons in place;
 * once moved, vanilla's icons are hidden and the whole panel (icons, bars, times) draws at the saved spot.
 */
public final class EffectTimers {
	private static final int ICON_SIZE = 24;
	private static final int ICON_SPACING = 25;
	private static final int HARMFUL_ROW_OFFSET = 26;
	private static final int DEMO_Y_OFFSET = 15;
	private static final int BAR_HEIGHT = 3;
	private static final int BAR_BOTTOM_INSET = 1;
	private static final float TEXT_SCALE = 0.5f;
	private static final int COLOR_GREEN = 0xFF3CC84A;
	private static final int COLOR_YELLOW = 0xFFE8C833;
	private static final int COLOR_RED = 0xFFE04038;
	private static final int COLOR_GRAY = 0xFF8A8A8A;
	private static final int COLOR_BAR_BG = 0xC0101010;
	private static final int COLOR_TEXT = 0xFFFFFFFF;
	private static final float YELLOW_FRACTION = 0.5f;
	private static final float RED_FRACTION = 0.2f;

	private static final Identifier BG = Identifier.withDefaultNamespace("hud/effect_background");
	private static final Identifier BG_AMBIENT = Identifier.withDefaultNamespace("hud/effect_background_ambient");

	private static final Map<Holder<MobEffect>, TrackedEffect> TRACKED = new HashMap<>();

	private EffectTimers() {
	}

	/** True once the effect panel was moved in the HUD editor: Saturn then draws the icons itself, vanilla's are hidden. */
	public static boolean replacesVanilla() {
		return CompanionConfig.module("effectTimers") && CompanionConfig.layout("effectTimers") != null;
	}

	/** Shown in the HUD editor when no effect is active, so the panel can still be placed. */
	private static List<MobEffectInstance> samples() {
		return List.of(
				new MobEffectInstance(MobEffects.SPEED, 20 * 151, 1),
				new MobEffectInstance(MobEffects.NIGHT_VISION, MobEffectInstance.INFINITE_DURATION),
				new MobEffectInstance(MobEffects.POISON, 20 * 9));
	}

	public static void extractHud(GuiGraphicsExtractor graphics, DeltaTracker deltaTracker) {
		if (!CompanionConfig.module("effectTimers")) {
			return;
		}

		Minecraft client = Minecraft.getInstance();
		if (client.player == null || client.level == null) {
			return;
		}

		Screen screen = client.gui.screen();
		if (screen != null && screen.showsActiveEffects()) {
			return;
		}

		Collection<MobEffectInstance> effects = client.player.getActiveEffects();
		List<MobEffectInstance> shown = new ArrayList<>();
		for (MobEffectInstance effect : Ordering.natural().reverse().sortedCopy(effects)) {
			if (effect.showIcon()) {
				shown.add(effect);
			}
		}
		boolean sample = shown.isEmpty() && HudRenderer.editing;
		if (effects.isEmpty()) {
			TRACKED.clear();
		} else {
			syncTracked(effects);
		}
		if (shown.isEmpty() && !sample) {
			return;
		}
		if (sample) {
			shown = samples();
		}

		graphics.nextStratum();

		int beneficial = 0;
		int harmful = 0;
		for (MobEffectInstance effect : shown) {
			if (effect.getEffect().value().isBeneficial()) {
				beneficial++;
			} else {
				harmful++;
			}
		}
		int top = 1 + (client.isDemo() ? DEMO_Y_OFFSET : 0);
		int cols = Math.max(1, Math.max(beneficial, harmful));
		int boxW = cols * ICON_SPACING - 1;
		int boxH = harmful > 0 ? HARMFUL_ROW_OFFSET + ICON_SIZE : ICON_SIZE;
		// Vanilla's spot: right-aligned at the top of the screen.
		boolean moved = HudRenderer.anchor(graphics, "effectTimers", graphics.guiWidth() - cols * ICON_SPACING, top, boxW, boxH, true);
		boolean drawIcons = moved || sample;

		Font font = client.font;
		int beneficialCount = 0;
		int harmfulCount = 0;
		// Mirror Hud.extractEffects icon placement so bars sit on the vanilla 24x24 frames.
		for (MobEffectInstance effect : shown) {
			int x = graphics.guiWidth();
			int y = top;
			if (effect.getEffect().value().isBeneficial()) {
				beneficialCount++;
				x -= ICON_SPACING * beneficialCount;
			} else {
				harmfulCount++;
				x -= ICON_SPACING * harmfulCount;
				y += HARMFUL_ROW_OFFSET;
			}
			if (drawIcons) {
				graphics.blitSprite(RenderPipelines.GUI_TEXTURED, effect.isAmbient() ? BG_AMBIENT : BG, x, y, ICON_SIZE, ICON_SIZE);
				graphics.blitSprite(RenderPipelines.GUI_TEXTURED, Hud.getMobEffectSprite(effect.getEffect()), x + 3, y + 3, 18, 18);
			}
			drawTimer(graphics, font, effect, x, y);
		}
		if (moved) {
			graphics.pose().popMatrix();
		}
	}

	private static void syncTracked(Collection<MobEffectInstance> effects) {
		Set<Holder<MobEffect>> seen = new HashSet<>();
		for (MobEffectInstance effect : effects) {
			Holder<MobEffect> holder = effect.getEffect();
			seen.add(holder);
			if (effect.isInfiniteDuration()) {
				TRACKED.remove(holder);
				continue;
			}

			int duration = effect.getDuration();
			int amplifier = effect.getAmplifier();
			TrackedEffect tracked = TRACKED.get(holder);
			if (tracked == null) {
				TRACKED.put(holder, new TrackedEffect(amplifier, Math.max(1, duration)));
			} else if (tracked.amplifier != amplifier || duration > tracked.maxDuration) {
				tracked.amplifier = amplifier;
				tracked.maxDuration = Math.max(1, duration);
			}
		}
		TRACKED.keySet().retainAll(seen);
	}

	private static void drawTimer(GuiGraphicsExtractor graphics, Font font, MobEffectInstance effect, int iconX, int iconY) {
		boolean infinite = effect.isInfiniteDuration();
		float fraction;
		int barColor;
		String label;

		if (infinite) {
			fraction = 1.0f;
			barColor = COLOR_GRAY;
			label = "\u221E";
		} else {
			TrackedEffect tracked = TRACKED.get(effect.getEffect());
			int maxDuration = tracked == null ? Math.max(1, effect.getDuration()) : tracked.maxDuration;
			fraction = Math.min(1.0f, Math.max(0.0f, effect.getDuration() / (float) maxDuration));
			barColor = barColor(fraction);
			label = formatRemaining(effect.getDuration());
		}

		int barY = iconY + ICON_SIZE - BAR_BOTTOM_INSET - BAR_HEIGHT;
		int barX1 = iconX + 1;
		int barX2 = iconX + ICON_SIZE - 1;
		int barWidth = barX2 - barX1;
		graphics.fill(barX1, barY, barX2, barY + BAR_HEIGHT, COLOR_BAR_BG);
		int filled = Math.round(barWidth * fraction);
		if (filled > 0) {
			graphics.fill(barX1, barY, barX1 + filled, barY + BAR_HEIGHT, barColor);
		}

		int textWidth = font.width(label);
		int textX = iconX + Math.round((ICON_SIZE - textWidth * TEXT_SCALE) / 2.0f);
		int textY = barY - Math.round(font.lineHeight * TEXT_SCALE) - 1;
		Matrix3x2fStack pose = graphics.pose();
		pose.pushMatrix();
		pose.translate(textX, textY);
		pose.scale(TEXT_SCALE, TEXT_SCALE);
		graphics.text(font, label, 0, 0, COLOR_TEXT, true);
		pose.popMatrix();
	}

	private static int barColor(float fraction) {
		if (fraction > YELLOW_FRACTION) {
			return COLOR_GREEN;
		}
		if (fraction > RED_FRACTION) {
			return COLOR_YELLOW;
		}
		return COLOR_RED;
	}

	private static String formatRemaining(int ticks) {
		int totalSeconds = Math.max(0, ticks) / 20;
		int minutes = totalSeconds / 60;
		int seconds = totalSeconds % 60;
		return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
	}

	private static final class TrackedEffect {
		private int amplifier;
		private int maxDuration;

		private TrackedEffect(int amplifier, int maxDuration) {
			this.amplifier = amplifier;
			this.maxDuration = maxDuration;
		}
	}
}
