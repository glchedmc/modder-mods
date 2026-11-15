package mc.glched.glasscompanion.mixin;

import mc.glched.glasscompanion.modules.Freelook;
import net.minecraft.client.Camera;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

@Mixin(Camera.class)
public abstract class FreelookCameraMixin {
	@Shadow
	protected abstract void setRotation(float yRot, float xRot);

	@Redirect(method = "alignWithEntity", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/Camera;setRotation(FF)V"), require = 1, allow = 8)
	private void glassCompanion$freelook(Camera self, float yRot, float xRot) {
		if (Freelook.active()) {
			setRotation(Freelook.yaw(), Freelook.pitch());
		} else {
			setRotation(yRot, xRot);
		}
	}
}
