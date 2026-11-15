package mc.glched.glasscompanion.ui;

import java.lang.ref.WeakReference;

import mc.glched.glasscompanion.CompanionConfig;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;

/** Swaps vanilla title/pause screens for Saturn's, except the ones the player asked to see in vanilla. */
public final class SaturnScreens {
	private static WeakReference<Screen> vanilla = new WeakReference<>(null);

	private SaturnScreens() {
	}

	/** Opens the vanilla version of a screen; it (and screens returning to it) stay vanilla. */
	public static Screen keepVanilla(Screen screen) {
		vanilla = new WeakReference<>(screen);
		return screen;
	}

	public static Screen replace(Screen screen) {
		if (screen == null || screen == vanilla.get()) {
			return screen;
		}
		if (screen.getClass() == TitleScreen.class && CompanionConfig.bool("saturnTitle")) {
			return new SaturnTitleScreen();
		}
		if (screen.getClass() == PauseScreen.class && ((PauseScreen) screen).showsPauseMenu() && CompanionConfig.bool("saturnPause")) {
			return new SaturnPauseScreen();
		}
		return screen;
	}
}
