package mc.glched.glasscompanion.mixin;

import mc.glched.glasscompanion.ClickTracker;
import mc.glched.glasscompanion.Zoom;

import net.minecraft.client.MouseHandler;
import net.minecraft.client.input.MouseButtonInfo;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(MouseHandler.class)
public class MouseHandlerMixin {
	@Inject(method = "onButton", at = @At("HEAD"))
	private void glassCompanion$click(long window, MouseButtonInfo info, int action, CallbackInfo ci) {
		if (action == 1) {
			ClickTracker.press(info.button());
		}
	}

	@Inject(method = "onScroll", at = @At("HEAD"), cancellable = true)
	private void glassCompanion$zoomScroll(long window, double xOffset, double yOffset, CallbackInfo ci) {
		if (Zoom.onScroll(yOffset)) {
			ci.cancel();
		}
	}
}
