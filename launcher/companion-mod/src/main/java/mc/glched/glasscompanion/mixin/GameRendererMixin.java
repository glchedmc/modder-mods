package mc.glched.glasscompanion.mixin;

import mc.glched.glasscompanion.CompanionConfig;

import com.mojang.blaze3d.vertex.PoseStack;

import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.client.renderer.state.level.CameraRenderState;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(GameRenderer.class)
public class GameRendererMixin {
	@Inject(method = "bobHurt", at = @At("HEAD"), cancellable = true)
	private void glassCompanion$noHurtCam(CameraRenderState camera, PoseStack pose, CallbackInfo ci) {
		if (CompanionConfig.bool("noHurtCam")) {
			ci.cancel();
		}
	}
}
