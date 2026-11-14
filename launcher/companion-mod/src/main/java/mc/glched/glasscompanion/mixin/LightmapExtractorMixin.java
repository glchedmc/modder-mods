package mc.glched.glasscompanion.mixin;

import mc.glched.glasscompanion.CompanionConfig;

import net.minecraft.client.renderer.LightmapRenderStateExtractor;
import net.minecraft.client.renderer.state.LightmapRenderState;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Fullbright: drive the lightmap as if night vision were fully active. */
@Mixin(LightmapRenderStateExtractor.class)
public class LightmapExtractorMixin {
	@Inject(method = "extract", at = @At("TAIL"))
	private void glassCompanion$fullbright(LightmapRenderState state, float partialTick, CallbackInfo ci) {
		if (CompanionConfig.bool("fullbright")) {
			state.nightVisionEffectIntensity = 1.0f;
			state.darknessEffectScale = 0.0f;
			state.brightness = Math.max(state.brightness, 1.0f);
			state.needsUpdate = true;
		}
	}
}
