package mc.glched.glasscompanion.ui;

import mc.glched.glasscompanion.CompanionMenuScreen;
import mc.glched.glasscompanion.Glass;
import mc.glched.glasscompanion.HudEditorScreen;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.WorldOptionsScreen;
import net.minecraft.client.gui.screens.achievement.StatsScreen;
import net.minecraft.client.gui.screens.advancements.AdvancementsScreen;
import net.minecraft.client.gui.screens.friends.FriendsOverlayScreen;
import net.minecraft.client.gui.screens.options.OnlineOptionsScreen;
import net.minecraft.client.gui.screens.options.OptionsScreen;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.network.chat.CommonComponents;
import net.minecraft.network.chat.Component;

/**
 * Saturn pause menu: a glass column on the left over the blurred world, with
 * the quick places you need mid-game. Vanilla's pause menu stays one click away.
 */
public final class SaturnPauseScreen extends Screen {
	private int panelX2;
	private int panelY1;
	private int panelY2;

	public SaturnPauseScreen() {
		super(Component.translatable("menu.game"));
	}

	@Override
	protected void init() {
		int x = 22;
		int w = Math.min(200, width / 2 - 30);
		int h = 22;
		int gap = 5;
		int half = (w - gap) / 2;
		int rows = 7;
		int total = 58 + rows * (h + gap) + 10;
		int y = Math.max(10, (height - total) / 2) + 58;
		panelY1 = y - 58;
		panelX2 = x + w + 14;

		addRenderableWidget(new GlassButton(x, y, w, h + 4, Component.literal("Back to game"), GlassButton.Style.PRIMARY, "▶", null, b -> {
			minecraft.gui.setScreen(null);
			minecraft.mouseHandler.grabMouse();
		}));
		y += h + 4 + gap;
		boolean local = minecraft.hasSingleplayerServer();
		if (local && minecraft.level != null) {
			addRenderableWidget(new GlassButton(x, y, w, h, Component.literal(minecraft.getSingleplayerServer() != null && minecraft.getSingleplayerServer().isPublished() ? "World options · Shared" : "World options / Open to LAN"),
					GlassButton.Style.PLAIN, "⚑", null, b -> minecraft.gui.setScreen(new WorldOptionsScreen(this, minecraft.level))));
		} else {
			addRenderableWidget(new GlassButton(x, y, w, h, Component.literal("Friends"), GlassButton.Style.PLAIN, "☺", null,
					b -> OnlineOptionsScreen.confirmFriendsListEnabled(minecraft, () -> minecraft.gui.setScreen(new FriendsOverlayScreen(this)), this)));
		}
		y += h + gap;
		addRenderableWidget(new GlassButton(x, y, half, h, Component.literal("Advancements"), GlassButton.Style.PLAIN, null, null,
				b -> minecraft.gui.setScreen(new AdvancementsScreen(minecraft.player.connection.getAdvancements(), this))));
		addRenderableWidget(new GlassButton(x + half + gap, y, w - half - gap, h, Component.literal("Statistics"), GlassButton.Style.PLAIN, null, null,
				b -> minecraft.gui.setScreen(new StatsScreen(this, minecraft.player.getStats()))));
		y += h + gap;
		addRenderableWidget(new GlassButton(x, y, half, h, Component.literal("Saturn mods"), GlassButton.Style.PLAIN, "✦", null,
				b -> minecraft.gui.setScreen(new CompanionMenuScreen(this))));
		addRenderableWidget(new GlassButton(x + half + gap, y, w - half - gap, h, Component.literal("Edit HUD"), GlassButton.Style.PLAIN, "✥", null,
				b -> minecraft.gui.setScreen(new HudEditorScreen(this))));
		y += h + gap;
		addRenderableWidget(new GlassButton(x, y, w, h, Component.literal("Options"), GlassButton.Style.PLAIN, "⚙", null,
				b -> minecraft.gui.setScreen(new OptionsScreen(this, minecraft.options))));
		y += h + gap;
		addRenderableWidget(new GlassButton(x, y, w, h, Component.literal("Vanilla pause menu"), GlassButton.Style.GHOST, "☰", null,
				b -> minecraft.gui.setScreen(SaturnScreens.keepVanilla(new PauseScreen(true)))));
		y += h + gap;
		addRenderableWidget(new GlassButton(x, y, w, h, CommonComponents.disconnectButtonLabel(minecraft.isLocalServer()), GlassButton.Style.DANGER, "⏻", null, b -> {
			b.active = false;
			minecraft.getReportingContext().draftReportHandled(minecraft, this, () -> minecraft.disconnectFromWorld(ClientLevel.DEFAULT_QUIT_MESSAGE), true);
		}));
		panelY2 = y + h + 12;
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mouseX, int mouseY, float partial) {
		if (Glass.blur()) {
			extractBlurredBackground(g);
		}
		int edge = Math.round(255 * (0.5f - 0.3f * Glass.strength()));
		g.fillGradient(0, 0, width, height, edge << 24 | 0x0B0E26, (edge / 3) << 24 | 0x0B0E26);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partial) {
		Glass.panel(g, 8, panelY1, panelX2, panelY2, 1f, 0x161A3A, 10);
		Glass.logo(g, 22, panelY1 + 12, 30);
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(58, panelY1 + 14);
		pose.scale(1.5f, 1.5f);
		g.text(font, "Paused", 0, 0, 0xFFFFFFFF, true);
		pose.popMatrix();
		String where = minecraft.hasSingleplayerServer() ? "Singleplayer" : minecraft.getCurrentServer() != null ? minecraft.getCurrentServer().ip : "Multiplayer";
		g.text(font, where, 58, panelY1 + 31, 0xA0D0D8F5, false);
		super.extractRenderState(g, mouseX, mouseY, partial);
	}
}
