package mc.glched.glasscompanion.mixin;

import mc.glched.glasscompanion.Zoom;

import net.minecraft.client.Camera;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(Camera.class)
public class CameraMixin {
	@Inject(method = "calculateFov", at = @At("RETURN"), cancellable = true)
	private void glassCompanion$zoom(float partialTick, CallbackInfoReturnable<Float> cir) {
		cir.setReturnValue(Zoom.applyFov(cir.getReturnValueF(), partialTick));
	}
}
