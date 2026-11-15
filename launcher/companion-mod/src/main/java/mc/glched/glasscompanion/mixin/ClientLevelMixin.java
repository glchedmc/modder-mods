package mc.glched.glasscompanion.mixin;

import mc.glched.glasscompanion.CompanionConfig;
import net.minecraft.client.multiplayer.ClientLevel;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ClientLevel.class)
public abstract class ClientLevelMixin {
	@Inject(method = "tickWeatherEffects", at = @At("HEAD"), cancellable = true)
	private void glassCompanion$noWeatherEffects(CallbackInfo ci) {
		if (CompanionConfig.module("clearWeather")) {
			ci.cancel();
		}
	}
}
