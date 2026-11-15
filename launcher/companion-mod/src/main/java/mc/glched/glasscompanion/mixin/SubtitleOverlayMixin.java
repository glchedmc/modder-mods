package mc.glched.glasscompanion.mixin;

import java.util.Locale;

import org.joml.Matrix3x2fStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

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
 */
@Mixin(SubtitleOverlay.class)
public class SubtitleOverlayMixin {
	@Unique
	private static final String MARK_RIGHT = "88m ▲";
	@Unique
	private int saturn$x1, saturn$x2;

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
