package mc.glched.glasscompanion.waypoints;

import com.mojang.blaze3d.platform.InputConstants;

import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;

/** B opens "New waypoint" at your feet; J opens the waypoint list. Both rebindable in Controls. */
public final class WaypointKeys {
	public static KeyMapping addKey;
	public static KeyMapping listKey;

	private WaypointKeys() {
	}

	public static void register(KeyMapping.Category category) {
		addKey = KeyMappingHelper.registerKeyMapping(new KeyMapping(
				"key.glass-companion.waypoint_add", InputConstants.Type.KEYBOARD, InputConstants.KEY_B, category));
		listKey = KeyMappingHelper.registerKeyMapping(new KeyMapping(
				"key.glass-companion.waypoint_list", InputConstants.Type.KEYBOARD, InputConstants.KEY_J, category));
	}

	public static void tick(Minecraft mc) {
		while (addKey.consumeClick()) {
			if (Waypoints.active() && mc.gui.screen() == null && mc.player != null) {
				mc.gui.setScreen(new WaypointEditScreen(null, newHere(mc), true));
			}
		}
		while (listKey.consumeClick()) {
			if (Waypoints.active() && mc.gui.screen() == null && mc.player != null) {
				mc.gui.setScreen(new WaypointListScreen(null));
			}
		}
	}

	public static Waypoints.Waypoint newHere(Minecraft mc) {
		LocalPlayer p = mc.player;
		return new Waypoints.Waypoint(Waypoints.nextName(mc), p.getBlockX(), p.getBlockY(), p.getBlockZ(), Waypoints.nextColor(mc), Waypoints.dimension(mc));
	}

	public static String addKeyName() {
		return addKey == null ? "B" : addKey.getTranslatedKeyMessage().getString();
	}

	public static String listKeyName() {
		return listKey == null ? "J" : listKey.getTranslatedKeyMessage().getString();
	}
}
