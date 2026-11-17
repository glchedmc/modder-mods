package mc.glched.glasscompanion.modules;

import mc.glched.glasscompanion.CompanionConfig;
import mc.glched.glasscompanion.HudRenderer;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;

import net.minecraft.ChatFormatting;
import net.minecraft.client.Camera;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.resources.sounds.SoundInstance;
import net.minecraft.client.sounds.SoundEventListener;
import net.minecraft.client.sounds.SoundManager;
import net.minecraft.client.sounds.WeighedSoundEvents;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.util.Util;
import net.minecraft.world.phys.Vec3;

import com.mojang.blaze3d.platform.InputConstants;

import org.joml.Matrix3x2fStack;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** From Echo Arrow: arrows on a ring around the crosshair point toward recent sounds (red hostile, gold note blocks). */
public final class EchoArrow implements SoundEventListener {
	public static final String MOD_ID = "echo-arrow";
	public static final Logger LOGGER = LoggerFactory.getLogger("glass-companion");

	private static final Identifier HUD_ID = Identifier.fromNamespaceAndPath(MOD_ID, "ring");
	private static final int COLOR_HOSTILE = 0xFFE04038;
	private static final int COLOR_BLOCK = 0xFFE8C833;
	private static final int COLOR_OTHER = 0xFFFFFFFF;
	private static final int COLOR_RING = 0x38FFFFFF;
	private static final int COLOR_TEXT_SHADOW = 0xFF000000;
	private static final double SELF_SOUND_DISTANCE = 1.5;
	private static final float TEXT_SCALE = 0.75f;
	private static final int ARROW_HEIGHT = 8;
	private static final int ARROW_HALF_WIDTH = 4;

	private static final List<HeardSound> HEARD = new ArrayList<>();
	private static final Object LOCK = new Object();
	/** Last position each subtitle was heard at, for the subtitle direction markers. */
	private static final java.util.Map<String, Vec3> SUBTITLE_POS = new java.util.concurrent.ConcurrentHashMap<>();

	public static Vec3 subtitlePos(String text) {
		return SUBTITLE_POS.get(text);
	}

	/** Subtitles mode: vanilla subtitles get exact direction arrows instead of < and >. */
	public static boolean subtitlesMode() {
		String m = CompanionConfig.string("echoArrowMode");
		return CompanionConfig.module("echoArrow") && (m.equals("subtitles") || m.equals("both"));
	}

	public static boolean ringMode() {
		String m = CompanionConfig.string("echoArrowMode");
		return !m.equals("subtitles");
	}

	private static boolean listenerAdded;

	public static void init() {
		if (INSTANCE == null) {
			new EchoArrow();
		}
		tryAddListener();
	}

	public static void onEndTick(Minecraft client) {
		tryAddListener();

		if (client.level == null || client.player == null) {
			SUBTITLE_POS.clear();
			synchronized (LOCK) {
				HEARD.clear();
			}
			return;
		}

		purgeExpired(Util.getMillis());
	}

	private static void tell(Minecraft client, Component message) {
		LocalPlayer player = client.player;
		if (player != null) {
			player.sendSystemMessage(message);
		}
	}

	private static void tryAddListener() {
		if (listenerAdded || INSTANCE == null) {
			return;
		}
		Minecraft client = Minecraft.getInstance();
		if (client == null) {
			return;
		}
		SoundManager sounds = client.getSoundManager();
		if (sounds == null) {
			return;
		}
		sounds.addListener(INSTANCE);
		listenerAdded = true;
	}

	// Held so addListener can use the same instance as this initializer.
	private static EchoArrow INSTANCE;

	public EchoArrow() {
		INSTANCE = this;
	}

	@Override
	public void onPlaySound(SoundInstance sound, WeighedSoundEvents events, float range) {
		if (sound == null || !CompanionConfig.module("echoArrow")) {
			return;
		}
		if (sound.isRelative()) {
			return;
		}
		SoundSource source = sound.getSource();
		if (source == SoundSource.UI || source == SoundSource.MUSIC) {
			return;
		}

		Identifier id = sound.getIdentifier();
		boolean noteBlock = isNoteBlock(id);
		if (!passesFilter(source, noteBlock)) {
			return;
		}

		Vec3 pos = new Vec3(sound.getX(), sound.getY(), sound.getZ());
		if (events != null && events.getSubtitle() != null) {
			SUBTITLE_POS.put(events.getSubtitle().getString(), pos);
		}
		Minecraft client = Minecraft.getInstance();
		if (client != null && client.player != null) {
			if (client.player.getEyePosition().distanceTo(pos) < SELF_SOUND_DISTANCE) {
				return;
			}
		}

		Component label = events == null ? null : events.getSubtitle();
		if (label == null) {
			label = fallbackName(id);
		}

		int color = colorFor(source, noteBlock);
		long now = Util.getMillis();
		String key = id == null ? label.getString() : id.toString();

		synchronized (LOCK) {
			for (HeardSound existing : HEARD) {
				if (existing.key.equals(key) && existing.pos.distanceTo(pos) <= EchoArrowSettings.mergeDistance) {
					existing.refresh(pos, now, color, label);
					return;
				}
			}

			purgeExpiredLocked(now);
			HEARD.add(new HeardSound(key, label, pos, source, noteBlock, color, now));
			while (HEARD.size() > EchoArrowSettings.maxArrows) {
				int oldest = 0;
				for (int i = 1; i < HEARD.size(); i++) {
					if (HEARD.get(i).heardAt < HEARD.get(oldest).heardAt) {
						oldest = i;
					}
				}
				HEARD.remove(oldest);
			}
		}
	}

	private static boolean passesFilter(SoundSource source, boolean noteBlock) {
		return switch (EchoArrowSettings.filter) {
			case ALL -> true;
			case HOSTILE -> source == SoundSource.HOSTILE;
			case NOTES -> noteBlock;
			case NOTES_AND_HOSTILE -> noteBlock || source == SoundSource.HOSTILE;
		};
	}

	private static boolean isNoteBlock(Identifier id) {
		if (id == null) {
			return false;
		}
		String path = id.getPath();
		return path.startsWith("block.note_block") || path.contains("note_block");
	}

	private static int colorFor(SoundSource source, boolean noteBlock) {
		if (source == SoundSource.HOSTILE) {
			return COLOR_HOSTILE;
		}
		if (noteBlock || source == SoundSource.BLOCKS || source == SoundSource.RECORDS) {
			return COLOR_BLOCK;
		}
		return COLOR_OTHER;
	}

	private static Component fallbackName(Identifier id) {
		if (id == null) {
			return Component.literal("Sound");
		}
		String path = id.getPath().replace('_', ' ').replace('.', ' ').trim();
		if (path.isEmpty()) {
			return Component.literal(id.toString());
		}
		StringBuilder pretty = new StringBuilder(path.length());
		boolean cap = true;
		for (int i = 0; i < path.length(); i++) {
			char c = path.charAt(i);
			if (c == ' ') {
				pretty.append(c);
				cap = true;
			} else if (cap) {
				pretty.append(Character.toUpperCase(c));
				cap = false;
			} else {
				pretty.append(c);
			}
		}
		return Component.literal(pretty.toString());
	}

	private static void purgeExpired(long now) {
		synchronized (LOCK) {
			purgeExpiredLocked(now);
		}
	}

	private static void purgeExpiredLocked(long now) {
		long fade = EchoArrowSettings.fadeMs;
		Iterator<HeardSound> it = HEARD.iterator();
		while (it.hasNext()) {
			if (now - it.next().heardAt >= fade) {
				it.remove();
			}
		}
	}

	public static void extractHud(GuiGraphicsExtractor graphics, DeltaTracker deltaTracker) {
		if (!CompanionConfig.module("echoArrow") || !ringMode()) {
			return;
		}
		Minecraft client = Minecraft.getInstance();
		if (client.level == null || client.player == null) {
			return;
		}
		Camera camera = client.gameRenderer.mainCamera();
		if (camera == null || !camera.isInitialized()) {
			return;
		}

		long now = Util.getMillis();
		List<HeardSound> snapshot;
		synchronized (LOCK) {
			purgeExpiredLocked(now);
			if (HEARD.isEmpty() && !HudRenderer.editing) {
				return;
			}
			snapshot = new ArrayList<>(HEARD);
		}

		graphics.nextStratum();

		int cx = graphics.guiWidth() / 2;
		int cy = graphics.guiHeight() / 2;
		int radius = EchoArrowSettings.ringRadius;
		// Movable HUD element "echoRing": centered on the crosshair until moved in the HUD editor.
		int reach = radius + ARROW_HEIGHT + 2;
		boolean moved = HudRenderer.anchor(graphics, "echoRing", cx - reach, cy - reach, 2 * reach, 2 * reach, true);
		drawRing(graphics, cx, cy, radius);
		if (snapshot.isEmpty()) {
			// Editor preview: one sample arrow and readout.
			float rad = (float) Math.toRadians(40);
			drawArrow(graphics, cx, cy, rad, radius, 0xFFFFD36B);
			String line = "Footsteps  6";
			int textRadius = radius + ARROW_HEIGHT + 6;
			int width = Math.round(client.font.width(line) * TEXT_SCALE);
			Matrix3x2fStack p = graphics.pose();
			p.pushMatrix();
			p.translate(cx + Math.round(Mth.sin(rad) * textRadius) - width / 2f, cy - Math.round(Mth.cos(rad) * textRadius) - 3);
			p.scale(TEXT_SCALE, TEXT_SCALE);
			graphics.text(client.font, line, 0, 0, 0xFFFFFFFF, true);
			p.popMatrix();
		}

		Vec3 camPos = camera.position();
		float yaw = camera.yRot();
		float pitch = camera.xRot();
		Font font = client.font;
		long fade = EchoArrowSettings.fadeMs;

		for (HeardSound heard : snapshot) {
			float age = (now - heard.heardAt) / (float) fade;
			if (age >= 1.0f) {
				continue;
			}
			float alpha = 1.0f - age;
			// Ease out so the last half-second drops faster.
			alpha = alpha * alpha * (3.0f - 2.0f * alpha);
			int color = withAlpha(heard.color, alpha);
			int textColor = withAlpha(0xFFFFFFFF, alpha);

			Vec3 delta = heard.pos.subtract(camPos);
			double distance = delta.length();
			float soundYaw = (float) Math.toDegrees(Math.atan2(-delta.x, delta.z));
			float relative = Mth.wrapDegrees(soundYaw - yaw);
			float rad = (float) Math.toRadians(relative);
			float sin = Mth.sin(rad);
			float cos = Mth.cos(rad);
			int ax = cx + Math.round(sin * radius);
			int ay = cy - Math.round(cos * radius);

			drawArrow(graphics, cx, cy, rad, radius, color);

			double horiz = Math.sqrt(delta.x * delta.x + delta.z * delta.z);
			float soundPitch = (float) Math.toDegrees(Math.atan2(delta.y, horiz));
			float relPitch = soundPitch - pitch;
			String vertical = "";
			if (relPitch > EchoArrowSettings.DEFAULT_PITCH_THRESHOLD) {
				vertical = " ^";
			} else if (relPitch < -EchoArrowSettings.DEFAULT_PITCH_THRESHOLD) {
				vertical = " v";
			}

			String name = heard.label.getString();
			if (name.length() > 22) {
				name = name.substring(0, 21) + "\u2026";
			}
			String line = name + "  " + String.format(Locale.ROOT, "%.0f", distance) + vertical;

			int textRadius = radius + ARROW_HEIGHT + 6;
			int tx = cx + Math.round(sin * textRadius);
			int ty = cy - Math.round(cos * textRadius);
			int width = Math.round(font.width(line) * TEXT_SCALE);
			int height = Math.round(font.lineHeight * TEXT_SCALE);
			int textX = tx - width / 2;
			int textY = ty - height / 2;
			// Keep labels from sitting on top of the crosshair.
			if (Math.abs(relative) < 25.0f && relPitch > -10.0f && relPitch < 25.0f && distance > 2.0) {
				textY -= height + 2;
			}

			Matrix3x2fStack pose = graphics.pose();
			pose.pushMatrix();
			pose.translate(textX, textY);
			pose.scale(TEXT_SCALE, TEXT_SCALE);
			graphics.text(font, line, 0, 0, textColor, true);
			pose.popMatrix();
		}
		if (moved) {
			graphics.pose().popMatrix();
		}
	}

	private static void drawRing(GuiGraphicsExtractor graphics, int cx, int cy, int radius) {
		int steps = Math.max(48, radius * 3);
		int prevX = cx;
		int prevY = cy - radius;
		for (int i = 1; i <= steps; i++) {
			double a = (Math.PI * 2.0 * i) / steps;
			int x = cx + (int) Math.round(Math.sin(a) * radius);
			int y = cy - (int) Math.round(Math.cos(a) * radius);
			graphics.fill(prevX, prevY, prevX + 1, prevY + 1, COLOR_RING);
			prevX = x;
			prevY = y;
		}
	}

	private static void drawArrow(GuiGraphicsExtractor graphics, int cx, int cy, float rad, int radius, int color) {
		Matrix3x2fStack pose = graphics.pose();
		pose.pushMatrix();
		pose.translate(cx, cy);
		// relative yaw is clockwise from forward-up; joml rotate is counter-clockwise.
		pose.rotate(-rad);
		pose.translate(0, -radius);
		for (int row = 0; row < ARROW_HEIGHT; row++) {
			int half = Math.max(1, Math.round(ARROW_HALF_WIDTH * (1.0f - row / (float) ARROW_HEIGHT)));
			int y = -row;
			graphics.fill(-half, y - 1, half + 1, y, color);
		}
		// tiny shaft so the arrow still reads when faded
		graphics.fill(-1, 0, 2, 3, color);
		pose.popMatrix();
	}

	private static int withAlpha(int color, float alpha) {
		int a = Math.round(((color >>> 24) & 0xFF) * Mth.clamp(alpha, 0.0f, 1.0f));
		return (a << 24) | (color & 0x00FFFFFF);
	}

	private static final class HeardSound {
		private final String key;
		private Component label;
		private Vec3 pos;
		private final SoundSource source;
		private final boolean noteBlock;
		private int color;
		private long heardAt;

		private HeardSound(String key, Component label, Vec3 pos, SoundSource source, boolean noteBlock, int color, long heardAt) {
			this.key = key;
			this.label = label;
			this.pos = pos;
			this.source = source;
			this.noteBlock = noteBlock;
			this.color = color;
			this.heardAt = heardAt;
		}

		private void refresh(Vec3 pos, long now, int color, Component label) {
			this.pos = pos;
			this.heardAt = now;
			this.color = color;
			this.label = label;
		}
	}
}
