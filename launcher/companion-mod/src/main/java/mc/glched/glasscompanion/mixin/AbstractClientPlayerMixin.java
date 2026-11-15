package mc.glched.glasscompanion.mixin;

import mc.glched.glasscompanion.Cosmetics;

import net.minecraft.client.Minecraft;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.core.ClientAsset;
import net.minecraft.world.entity.player.PlayerModelType;
import net.minecraft.world.entity.player.PlayerSkin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Swaps in the Saturn cosmetic cape and optional library skin for the local player (visible to you only). */
@Mixin(AbstractClientPlayer.class)
public class AbstractClientPlayerMixin {
	@Inject(method = "getSkin", at = @At("RETURN"), cancellable = true)
	private void glassCompanion$cape(CallbackInfoReturnable<PlayerSkin> cir) {
		ClientAsset.Texture cape = Cosmetics.cape();
		ClientAsset.Texture body = Cosmetics.skin();
		if ((cape == null && body == null) || (Object) this != Minecraft.getInstance().player) return;
		PlayerSkin skin = cir.getReturnValue();
		if (skin == null) return;
		cir.setReturnValue(new PlayerSkin(
				body != null ? body : skin.body(),
				cape != null ? cape : skin.cape(),
				cape != null && Cosmetics.capeOnElytra() ? cape : skin.elytra(),
				body != null ? (Cosmetics.slim() ? PlayerModelType.SLIM : PlayerModelType.WIDE) : skin.model(),
				skin.secure()));
	}
}
