package mc.glched.glasscompanion.mixin;

import java.util.Optional;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import mc.glched.glasscompanion.modules.ShulkerPreview;
import net.minecraft.world.inventory.tooltip.TooltipComponent;
import net.minecraft.world.item.ItemStack;

@Mixin(ItemStack.class)
public class ItemStackMixin {
	@Inject(method = "getTooltipImage", at = @At("RETURN"), cancellable = true)
	private void glassCompanion$shulkerPreview(CallbackInfoReturnable<Optional<TooltipComponent>> cir) {
		if (cir.getReturnValue().isEmpty()) {
			Optional<TooltipComponent> image = ShulkerPreview.image((ItemStack) (Object) this);
			if (image.isPresent()) {
				cir.setReturnValue(image);
			}
		}
	}
}
