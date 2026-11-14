package mc.glched.glasscompanion.mixin;

import mc.glched.glasscompanion.CompanionConfig;

import net.minecraft.client.renderer.ScreenEffectRenderer;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import net.minecraft.client.renderer.state.level.PlayerRenderState;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ScreenEffectRenderer.class)
public class ScreenEffectRendererMixin {
	@Inject(method = "submit", at = @At("HEAD"))
	private void glassCompanion$hideFire(float partialTick, SubmitNodeCollector collector, PlayerRenderState player, CameraRenderState camera, boolean flag, CallbackInfo ci) {
		if (CompanionConfig.bool("hideFireOverlay")) {
			player.isOnFire = false;
		}
	}
}
