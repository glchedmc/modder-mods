package mc.glched.glasscompanion.modules;

import mc.glched.glasscompanion.mixin.AbstractFurnaceMenuAccessor;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.inventory.AbstractFurnaceScreen;
import net.minecraft.world.inventory.AbstractFurnaceMenu;
import net.minecraft.world.inventory.ContainerData;
import net.minecraft.world.item.ItemStack;
import org.joml.Matrix3x2fStack;

/**
 * Draws compact fuel/cook readouts on {@link AbstractFurnaceScreen}.
 *
 * <p>Vanilla furnace GUI (176×166): flame at (56, 36) 14×14, arrow at (79, 34)
 * 24×16, ingredient (56, 17), fuel (56, 53), result (116, 35). Text sits in the
 * empty strip left of the flame/fuel slots and in the gap above the arrow, and
 * is scaled down so it does not overlap slots.
 *
 * <p>Synced {@link ContainerData} slots (see {@link net.minecraft.world.level.block.entity.AbstractFurnaceBlockEntity}):
 * 0 = litTime, 1 = litDuration, 2 = cookingProgress, 3 = cookingTotalTime.
 * {@link AbstractFurnaceMenu#getLitProgress()} is fuel remaining;
 * {@link AbstractFurnaceMenu#getBurnProgress()} is cook progress despite the name.
 * Blast furnaces and smokers already report halved cook totals, so seconds and
 * the items-remaining estimate use those synced totals rather than a hardcoded 200.
 */
public final class FurnaceGauge {
	private static final int COLOR = 0xFF404040;
	private static final float SCALE = 0.7f;

	private FurnaceGauge() {
	}

	public static void draw(AbstractFurnaceScreen<?> screen, GuiGraphicsExtractor graphics, int leftPos, int topPos) {
		AbstractFurnaceMenu menu = screen.getMenu();
		ContainerData data = ((AbstractFurnaceMenuAccessor) menu).glassCompanion$furnaceData();
		if (data == null || data.getCount() < AbstractFurnaceMenu.DATA_COUNT) {
			return;
		}

		int litTime = Math.max(0, data.get(0));
		int litDuration = Math.max(0, data.get(1));
		int cookingProgress = Math.max(0, data.get(2));
		int cookingTotalTime = Math.max(0, data.get(3));

		int cookTotal = cookingTotalTime;
		if (cookTotal <= 0) {
			cookTotal = FuelTimes.isFastCooker(menu) ? 100 : 200;
		}

		int fuelPercent = percent(litTime, litDuration);
		int cookPercent = percent(cookingProgress, cookingTotalTime);
		int fuelTicksLeft = litTime;
		int cookTicksLeft = Math.max(0, cookingTotalTime - cookingProgress);

		ItemStack fuelStack = menu.getSlot(AbstractFurnaceMenu.FUEL_SLOT).getItem();
		int burnPerItem = FuelTimes.burnTicksPerItem(fuelStack, menu, litDuration);
		double itemsLeft = 0;
		if (cookTotal > 0) {
			itemsLeft += fuelTicksLeft / (double) cookTotal;
			if (burnPerItem > 0 && !fuelStack.isEmpty()) {
				itemsLeft += fuelStack.getCount() * (burnPerItem / (double) cookTotal);
			}
		}

		Font font = screen.getFont();
		Matrix3x2fStack pose = graphics.pose();

		// Left of the flame (x≈4–54, y≈36–52) and fuel slot (y≈53+).
		drawLines(graphics, pose, font, leftPos + 4, topPos + 36, new String[] {
			"Fuel: " + fuelPercent + "%",
			formatSeconds(fuelTicksLeft)
		});
		if (itemsLeft > 0.05 || !fuelStack.isEmpty() || litTime > 0) {
			drawLines(graphics, pose, font, leftPos + 4, topPos + 55, new String[] {
				"Smelt: " + formatItems(itemsLeft)
			});
		}

		// Above the progress arrow (x≈72–115, y≈20–32), clear of the result slot.
		drawLines(graphics, pose, font, leftPos + 72, topPos + 20, new String[] {
			"Cook: " + cookPercent + "%",
			cookingTotalTime > 0 && (cookingProgress > 0 || litTime > 0) ? formatSeconds(cookTicksLeft) : "0s"
		});
	}

	private static void drawLines(GuiGraphicsExtractor graphics, Matrix3x2fStack pose, Font font, int x, int y, String[] lines) {
		pose.pushMatrix();
		pose.translate(x, y);
		pose.scale(SCALE);
		for (int i = 0; i < lines.length; i++) {
			graphics.text(font, lines[i], 0, i * font.lineHeight, COLOR, false);
		}
		pose.popMatrix();
	}

	private static int percent(int current, int total) {
		if (current <= 0 || total <= 0) {
			return 0;
		}
		return Math.min(100, Math.round(100f * current / (float) total));
	}

	private static String formatSeconds(int ticks) {
		if (ticks <= 0) {
			return "0s";
		}
		float seconds = ticks / 20.0f;
		if (seconds < 10.0f) {
			return String.format(java.util.Locale.US, "%.1fs", seconds);
		}
		return Math.round(seconds) + "s";
	}

	private static String formatItems(double items) {
		if (items <= 0) {
			return "0";
		}
		if (items >= 100 || Math.abs(items - Math.round(items)) < 0.05) {
			return Long.toString(Math.round(items));
		}
		return String.format(java.util.Locale.US, "%.1f", items);
	}
}
