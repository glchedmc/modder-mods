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
 * Saturn home screen: blurred panorama, the ring logo, and one glass card of
 * the places you actually go. No store. Vanilla's title screen is a click away.
 */
public final class SaturnTitleScreen extends Screen {
	private static final DateTimeFormatter CLOCK = DateTimeFormatter.ofPattern("h:mm a", Locale.ROOT);
	private int cardX1, cardY1, cardX2, cardY2;

	public SaturnTitleScreen() {
		super(Component.literal("Saturn Client"));
	}

	private boolean compact;
	private int logoSize = 54;

	@Override
	protected void init() {
		int cardW = Math.min(300, width - 40);
		// Compact layout for small windows (vanilla's default 854x480 is 240 tall at GUI scale 2).
		compact = height < 300;
		logoSize = compact ? 30 : 54;
		int tileH = compact ? 24 : 34;
		int gap = compact ? 4 : 6;
		int bigH = compact ? 30 : 40;
		int pad = compact ? 8 : 14;
		int cardH = pad + bigH * 2 + gap + gap + tileH + pad;
		cardX1 = (width - cardW) / 2;
		cardX2 = cardX1 + cardW;
		int header = logoSize + (compact ? 24 : 34);
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
		extractPanorama(g, partial);
		if (Glass.blur()) {
			extractBlurredBackground(g);
		}
		Glass.wash(g, width, height);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partial) {
		Glass.panel(g, cardX1, cardY1, cardX2, cardY2, 1f, 0x161A3A, 10);
		super.extractRenderState(g, mouseX, mouseY, partial);
		int logo = logoSize;
		int ly = Math.max(4, cardY1 - logo - (compact ? 22 : 30));
		Glass.logo(g, width / 2 - logo / 2, ly, logo);
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(width / 2f, ly + logo + 4);
		pose.scale(compact ? 1.5f : 2f, compact ? 1.5f : 2f);
		String word = "SATURN";
		g.text(font, word, -font.width(word) / 2, 0, 0xFFFFFFFF, true);
		pose.popMatrix();
		if (!compact) g.centeredText(font, "CLIENT", width / 2, ly + logo + 23, Glass.mix(Glass.accent(), 0xFFFFFF, 0.35f));

		// Footer: who and what, plus a clock like the launcher's top bar.
		String who = minecraft.getUser().getName();
		g.text(font, "● " + who, 10, height - 21, 0xFFE6EAFF, true);
		g.text(font, "Minecraft " + SharedConstants.getCurrentVersion().name() + " · Saturn Client", 10, height - 11, 0x99FFFFFF, false);
		String time = LocalTime.now().format(CLOCK);
		g.text(font, time, width - font.width(time) - 10, 8, 0xCCFFFFFF, true);
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
