package mc.glched.glasscompanion.mixin;

import mc.glched.glasscompanion.modules.Freelook;
import net.minecraft.client.MouseHandler;
import net.minecraft.client.player.LocalPlayer;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

@Mixin(MouseHandler.class)
public abstract class FreelookMouseMixin {
	@Redirect(method = "turnPlayer", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/player/LocalPlayer;turn(DD)V"))
	private void glassCompanion$freelookTurn(LocalPlayer player, double dx, double dy) {
		if (Freelook.active()) {
			Freelook.turn(dx, dy);
		} else {
			player.turn(dx, dy);
		}
	}
}
