package mc.glched.glasscompanion.mixin;

import mc.glched.glasscompanion.CompanionConfig;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.WeatherEffectRenderer;
import net.minecraft.client.renderer.state.level.WeatherRenderState;
import net.minecraft.world.phys.Vec3;

import com.mojang.renderpearl.api.commands.RenderPass;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Clear weather (visual only, from Clear Skies): no rain or snow drawn on this screen. */
@Mixin(WeatherEffectRenderer.class)
public abstract class WeatherEffectRendererMixin {
	@Inject(method = "extractRenderState", at = @At("HEAD"), cancellable = true)
	private void glassCompanion$noWeatherState(ClientLevel level, float partialTick, Vec3 cameraPosition, WeatherRenderState renderState, CallbackInfo ci) {
		if (CompanionConfig.module("clearWeather")) {
			renderState.rainColumns.clear();
			renderState.snowColumns.clear();
			ci.cancel();
		}
	}

	@Inject(method = "render(Lnet/minecraft/client/renderer/state/level/WeatherRenderState;Lcom/mojang/renderpearl/api/commands/RenderPass;)V", at = @At("HEAD"), cancellable = true)
	private void glassCompanion$noWeatherRender(WeatherRenderState renderState, RenderPass renderPass, CallbackInfo ci) {
		if (CompanionConfig.module("clearWeather")) {
			ci.cancel();
		}
	}
}
