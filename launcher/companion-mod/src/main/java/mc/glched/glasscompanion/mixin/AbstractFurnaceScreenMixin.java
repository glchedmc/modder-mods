package mc.glched.glasscompanion.mixin;

import mc.glched.glasscompanion.CompanionConfig;
import mc.glched.glasscompanion.modules.FurnaceGauge;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.inventory.AbstractFurnaceScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(AbstractFurnaceScreen.class)
public abstract class AbstractFurnaceScreenMixin {
	@Inject(method = "extractBackground", at = @At("RETURN"))
	private void glassCompanion$furnaceGauge(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick, CallbackInfo ci) {
		if (CompanionConfig.module("furnaceGauge")) {
			AbstractContainerScreenAccessor self = (AbstractContainerScreenAccessor) this;
			FurnaceGauge.draw((AbstractFurnaceScreen<?>) (Object) this, graphics, self.glassCompanion$leftPos(), self.glassCompanion$topPos());
		}
	}
}
