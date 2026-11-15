package mc.glched.glasscompanion.mixin;

import mc.glched.glasscompanion.ui.SaturnScreens;
import net.minecraft.client.gui.Gui;
import net.minecraft.client.gui.screens.Screen;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

/** Saturn title and pause menus stand in for vanilla's (each can be turned off, and vanilla is one click away). */
@Mixin(Gui.class)
public class GuiMixin {
	@ModifyVariable(method = "setScreen", at = @At("HEAD"), argsOnly = true)
	private Screen glassCompanion$saturnScreens(Screen screen) {
		return SaturnScreens.replace(screen);
	}
}
