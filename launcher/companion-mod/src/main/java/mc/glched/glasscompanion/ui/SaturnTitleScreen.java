package mc.glched.glasscompanion.ui;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

import mc.glched.glasscompanion.CompanionMenuScreen;
import mc.glched.glasscompanion.Glass;
import mc.glched.glasscompanion.GlassCompanion;
import net.minecraft.SharedConstants;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.gui.screens.friends.FriendsOverlayScreen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.gui.screens.options.OnlineOptionsScreen;
import net.minecraft.client.gui.screens.options.OptionsScreen;
import net.minecraft.client.gui.screens.worldselection.SelectWorldScreen;
import net.minecraft.network.chat.Component;

/**
 * Saturn home screen: the Saturn space panorama (built-in "Saturn panorama"
 * resource pack), the ring logo beside a giant SATURN title, and one glass card
 * of the places you actually go. No store. Vanilla's title screen is a click away.
 */
public final class SaturnTitleScreen extends Screen {
	private static final DateTimeFormatter CLOCK = DateTimeFormatter.ofPattern("h:mm a", Locale.ROOT);
	private int cardX1, cardY1, cardX2, cardY2;

	public SaturnTitleScreen() {
		super(Component.literal("Saturn"));
	}

	private boolean compact;
	private int logoSize = 54;
	private float titleScale = 5f;
	private static final String WORD = "SATURN";
	private static final int LETTER_GAP = 2;

	/** Unscaled width of the spaced-out title. */
	private int titleWidth() {
		int w = 0;
		for (int i = 0; i < WORD.length(); i++) {
			w += font.width(String.valueOf(WORD.charAt(i))) + (i < WORD.length() - 1 ? LETTER_GAP : 0);
		}
		return w;
	}

	@Override
	protected void init() {
		int cardW = Math.min(300, width - 40);
		// Compact layout for small windows (vanilla's default 854x480 is 240 tall at GUI scale 2).
		compact = height < 300;
		titleScale = Math.max(3f, Math.min(compact ? 5f : 8f, (width * 0.5f) / titleWidth()));
		logoSize = Math.round(font.lineHeight * titleScale * 1.45f);
		int tileH = compact ? 24 : 34;
		int gap = compact ? 4 : 6;
		int bigH = compact ? 30 : 40;
		int pad = compact ? 8 : 14;
		int cardH = pad + bigH * 2 + gap + gap + tileH + pad;
		cardX1 = (width - cardW) / 2;
		cardX2 = cardX1 + cardW;
		int header = logoSize + (compact ? 10 : 22);
		int top = Math.max(height / 2 - cardH / 2 + 18, header + 8);
		if (top + cardH > height - 30) {
			top = Math.max(header, height - 30 - cardH);
		}
		cardY1 = top;
		cardY2 = top + cardH;
		int x = cardX1 + 14;
		int w = cardW - 28;
		int y = top + pad;
		addRenderableWidget(new GlassButton(x, y, w, bigH, Component.literal("Singleplayer"), GlassButton.Style.PRIMARY, "⛏", "Your worlds",
				b -> minecraft.gui.setScreen(new SelectWorldScreen(this))));
		y += bigH + gap;
		addRenderableWidget(new GlassButton(x, y, w, bigH, Component.literal("Multiplayer"), GlassButton.Style.PLAIN, "⚑", "Servers, LAN and friends' worlds",
				b -> minecraft.gui.setScreen(new JoinMultiplayerScreen(this))));
		y += bigH + gap;
		int third = (w - 2 * gap) / 3;
		addRenderableWidget(new GlassButton(x, y, third, tileH, Component.literal("Friends"), GlassButton.Style.PLAIN, "☺", null,
				b -> OnlineOptionsScreen.confirmFriendsListEnabled(minecraft, () -> minecraft.gui.setScreen(new FriendsOverlayScreen(this)), this)));
		addRenderableWidget(new GlassButton(x + third + gap, y, third, tileH, Component.literal("Mods"), GlassButton.Style.PLAIN, "✦", null,
				b -> minecraft.gui.setScreen(new CompanionMenuScreen(this))));
		addRenderableWidget(new GlassButton(x + 2 * (third + gap), y, w - 2 * (third + gap), tileH, Component.literal("Settings"), GlassButton.Style.PLAIN, "⚙", null,
				b -> minecraft.gui.setScreen(new OptionsScreen(this, minecraft.options))));

		// Corner pills: vanilla menu and quit.
		int pillW = 92;
		addRenderableWidget(new GlassButton(width - pillW * 2 - 14, height - 26, pillW, 18, Component.literal("Vanilla menu"), GlassButton.Style.GHOST, "☰", null,
				b -> minecraft.gui.setScreen(SaturnScreens.keepVanilla(new TitleScreen()))));
		addRenderableWidget(new GlassButton(width - pillW - 8, height - 26, pillW, 18, Component.literal("Quit"), GlassButton.Style.DANGER, "⏻", null,
				b -> minecraft.stop()));
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mouseX, int mouseY, float partial) {
		// The panorama stays sharp here (it is the point of the screen); a soft
		// top-and-bottom vignette keeps the text readable.
		extractPanorama(g, partial);
		int a = Math.round(255 * (0.30f - 0.12f * Glass.strength()));
		g.fillGradient(0, 0, width, height / 3, (a << 24) | 0x05061A, 0x0005061A);
		g.fillGradient(0, height * 2 / 3, width, height, 0x0005061A, (Math.min(255, a + 40) << 24) | 0x05061A);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partial) {
		Glass.panel(g, cardX1, cardY1, cardX2, cardY2, 1f, 0x232A5E, 10);
		super.extractRenderState(g, mouseX, mouseY, partial);

		// Header: ring logo on the left, giant SATURN on the same line.
		float sc = titleScale;
		int textW = Math.round(titleWidth() * sc);
		int textH = Math.round((font.lineHeight - 1) * sc);
		int gap = Math.round(sc * 2.5f);
		int total = logoSize + gap + textW;
		int lx = (width - total) / 2;
		int cy = Math.max(logoSize / 2 + 4, (cardY1 - (compact ? 6 : 14)) / 2);
		Glass.logo(g, lx, cy - logoSize / 2, logoSize);
		var pose = g.pose();
		int tx = lx + logoSize + gap;
		int ty = cy - textH / 2;
		int glow = Glass.mix(Glass.accent(), 0xFFFFFF, 0.25f) & 0x00FFFFFF;
		drawTitle(g, tx, ty + Math.max(1, Math.round(sc * 0.6f)), sc, 0x90000000 | 0x0A0C24);
		drawTitle(g, tx, ty, sc, 0xFF000000 | glow);
		drawTitle(g, tx, ty - Math.max(1, Math.round(sc * 0.35f)), sc, 0xFFFFFFFF);

		// Footer: who and the game version, plus a clock like the launcher's top bar.
		String who = minecraft.getUser().getName();
		g.text(font, "● " + who, 10, height - 21, 0xFFF2F4FF, true);
		g.text(font, "Minecraft " + SharedConstants.getCurrentVersion().name(), 10, height - 11, 0xCCFFFFFF, true);
		String time = LocalTime.now().format(CLOCK);
		g.text(font, time, width - font.width(time) - 10, 8, 0xEEFFFFFF, true);
	}

	/** The spaced-out title in one color at the given scale. */
	private void drawTitle(GuiGraphicsExtractor g, int x, int y, float sc, int color) {
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(x, y);
		pose.scale(sc, sc);
		int cx = 0;
		for (int i = 0; i < WORD.length(); i++) {
			String ch = String.valueOf(WORD.charAt(i));
			g.text(font, ch, cx, 0, color, false);
			cx += font.width(ch) + LETTER_GAP;
		}
		pose.popMatrix();
	}

	@Override
	public boolean shouldCloseOnEsc() {
		return false;
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	static {
		GlassCompanion.LOGGER.debug("[glass-companion] Saturn title screen ready");
	}
}
