package mc.glched.glasscompanion.mixin;

import java.util.Locale;

import org.joml.Matrix3x2fStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import mc.glched.glasscompanion.CompanionConfig;
import mc.glched.glasscompanion.HudRenderer;

import mc.glched.glasscompanion.modules.EchoArrow;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.SubtitleOverlay;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.network.chat.Component;
import net.minecraft.world.phys.Vec3;

/**
 * Echo Arrow in subtitles: each subtitle line gets a compass arrow turned to
 * the sound's exact bearing from where you face, plus distance and an up/down
 * mark, in place of vanilla's plain < and > side marks.
 *
 * The subtitle box is also a movable HUD element ("subtitles") while Echo Arrow's
 * subtitle mode is on: until moved it stays in vanilla's bottom-right spot; once
 * moved, the whole box is drawn at the saved spot and scale.
 */
@Mixin(SubtitleOverlay.class)
public class SubtitleOverlayMixin {
	@Unique
	private static final String MARK_RIGHT = "88m ▲";
	@Unique
	private int saturn$x1, saturn$x2;
	/** Rows and box width drawn this frame / last frame (vanilla's size, before any move). */
	@Unique
	private int saturn$rows, saturn$boxW, saturn$lastRows, saturn$lastBoxW;
	@Unique
	private boolean saturn$moved, saturn$sample;

	@Unique
	private static boolean saturn$movable() {
		return CompanionConfig.module("echoArrow") && EchoArrow.subtitlesMode();
	}

	@Inject(method = "extractRenderState", at = @At("HEAD"))
	private void glassCompanion$moveBegin(GuiGraphicsExtractor g, CallbackInfo ci) {
		saturn$rows = 0;
		saturn$boxW = 0;
		saturn$moved = false;
		saturn$sample = false;
		if (!saturn$movable()) {
			return;
		}
		Minecraft mc = Minecraft.getInstance();
		int rows = saturn$lastRows;
		int boxW = saturn$lastBoxW;
		boolean listening = mc.options.showSubtitles().get();
		if ((rows == 0 || !listening) && HudRenderer.editing) {
			saturn$sample = true;
			rows = 2;
			boxW = saturn$sampleWidth(mc.font);
		}
		boolean record = rows > 0;
		if (rows == 0) {
			// Nothing on screen last frame: still map new rows to the saved spot (size settles next frame).
			rows = 1;
			boxW = 120;
		}
		int boxH = rows * 10;
		saturn$moved = HudRenderer.anchor(g, "subtitles", g.guiWidth() - 1 - boxW, g.guiHeight() - 30 - boxH, boxW, boxH, record);
	}

	@Unique
	private static final String[] SAMPLE = {"Footsteps", "Chest opens"};

	@Unique
	private static int saturn$sampleWidth(Font font) {
		int w = 0;
		for (String s : SAMPLE) {
			w = Math.max(w, font.width(s));
		}
		w += 2 * font.width(MARK_RIGHT) + 2 * font.width(" ");
		return w + 2;
	}

	@Inject(method = "extractRenderState", at = @At("RETURN"))
	private void glassCompanion$moveEnd(GuiGraphicsExtractor g, CallbackInfo ci) {
		if (saturn$sample && saturn$rows == 0) {
			// HUD editor preview in vanilla's own layout.
			Font font = Minecraft.getInstance().font;
			int boxW = saturn$sampleWidth(font);
			for (int row = 0; row < SAMPLE.length; row++) {
				int cx = g.guiWidth() - boxW / 2 - 1;
				int cy = g.guiHeight() - 35 - row * 10;
				g.fill(cx - boxW / 2, cy - 5, cx + boxW / 2, cy + 5, 0xCC000000);
				g.text(font, "➤", cx - boxW / 2 + 4, cy - 4, 0xFFFFFFFF);
				g.text(font, SAMPLE[row], cx - font.width(SAMPLE[row]) / 2, cy - 4, 0xFFFFFFFF);
				String mark = (row == 0 ? 6 : 14) + "m";
				g.text(font, mark, cx + boxW / 2 - 1 - font.width(mark), cy - 4, 0xFFFFFFFF);
			}
		}
		if (saturn$moved) {
			g.pose().popMatrix();
		}
		saturn$lastRows = saturn$rows;
		saturn$lastBoxW = saturn$boxW;
	}

	@Redirect(method = "extractRenderState", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/Font;width(Ljava/lang/String;)I"))
	private int glassCompanion$markWidth(Font font, String s) {
		if (EchoArrow.subtitlesMode()) {
			// Same width both sides: vanilla centres the text between the two marks.
			if (s.equals("<") || s.equals(">")) {
				return font.width(MARK_RIGHT);
			}
		}
		return font.width(s);
	}

	@Redirect(method = "extractRenderState", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/GuiGraphicsExtractor;fill(IIIII)V"))
	private void glassCompanion$rowBox(GuiGraphicsExtractor g, int x1, int y1, int x2, int y2, int color) {
		saturn$x1 = x1;
		saturn$x2 = x2;
		saturn$rows++;
		saturn$boxW = Math.max(saturn$boxW, x2 - x1);
		g.fill(x1, y1, x2, y2, color);
	}

	@Redirect(method = "extractRenderState", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/GuiGraphicsExtractor;text(Lnet/minecraft/client/gui/Font;Ljava/lang/String;III)V"))
	private void glassCompanion$sideMark(GuiGraphicsExtractor g, Font font, String s, int x, int y, int color) {
		if (EchoArrow.subtitlesMode() && (s.equals("<") || s.equals(">"))) {
			return;
		}
		g.text(font, s, x, y, color);
	}

	@Redirect(method = "extractRenderState", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/GuiGraphicsExtractor;text(Lnet/minecraft/client/gui/Font;Lnet/minecraft/network/chat/Component;III)V"))
	private void glassCompanion$subtitleText(GuiGraphicsExtractor g, Font font, Component text, int x, int y, int color) {
		g.text(font, text, x, y, color);
		if (!EchoArrow.subtitlesMode()) {
			return;
		}
		LocalPlayer p = Minecraft.getInstance().player;
		Vec3 pos = EchoArrow.subtitlePos(text.getString());
		if (p == null || pos == null) {
			return;
		}
		Vec3 eye = p.getEyePosition();
		double dx = pos.x - eye.x;
		double dz = pos.z - eye.z;
		double dist = Math.sqrt(dx * dx + dz * dz + (pos.y - eye.y) * (pos.y - eye.y));
		double bearing = Math.toDegrees(Math.atan2(-dx, dz));
		double rel = ((bearing - p.getYRot()) % 360 + 540) % 360 - 180;
		// The arrow glyph points right; rotate so straight ahead points up.
		Matrix3x2fStack pose = g.pose();
		pose.pushMatrix();
		int aw = font.width("➤");
		pose.translate(saturn$x1 + 4 + aw / 2f, y + font.lineHeight / 2f - 1);
		pose.rotate((float) Math.toRadians(rel - 90));
		g.text(font, "➤", -aw / 2, -font.lineHeight / 2 + 1, color);
		pose.popMatrix();
		double dy = pos.y - eye.y;
		String mark = Math.round(dist) + "m" + (dy > 2 ? " ▲" : dy < -2 ? " ▼" : "");
		g.text(font, mark, saturn$x2 - 1 - font.width(mark), y, color);
	}
}
