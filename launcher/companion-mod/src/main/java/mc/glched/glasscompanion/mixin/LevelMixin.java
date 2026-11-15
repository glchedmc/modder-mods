package mc.glched.glasscompanion.mixin;

import mc.glched.glasscompanion.CompanionConfig;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.world.level.Level;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Clear weather is visual: only the client's level reports no rain darkness; server weather and isRaining are untouched. */
@Mixin(Level.class)
public abstract class LevelMixin {
	@Inject(method = "getRainLevel", at = @At("HEAD"), cancellable = true)
	private void glassCompanion$clearRain(float partialTick, CallbackInfoReturnable<Float> cir) {
		if ((Object) this instanceof ClientLevel && CompanionConfig.module("clearWeather")) {
			cir.setReturnValue(0.0F);
		}
	}

	@Inject(method = "getThunderLevel", at = @At("HEAD"), cancellable = true)
	private void glassCompanion$clearThunder(float partialTick, CallbackInfoReturnable<Float> cir) {
		if ((Object) this instanceof ClientLevel && CompanionConfig.module("clearWeather")) {
			cir.setReturnValue(0.0F);
		}
	}
}
