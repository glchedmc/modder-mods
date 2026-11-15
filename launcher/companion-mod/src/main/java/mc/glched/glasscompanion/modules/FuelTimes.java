package mc.glched.glasscompanion.modules;

import java.util.HashMap;
import java.util.Map;
import net.minecraft.core.component.DataComponents;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.inventory.AbstractFurnaceMenu;
import net.minecraft.world.inventory.BlastFurnaceMenu;
import net.minecraft.world.inventory.SmokerMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.CookingFuel;
import net.minecraft.world.level.storage.loot.providers.number.ints.ContextIntProvider;
import net.minecraft.world.level.storage.loot.providers.number.ints.ContextIntProviders;
import net.minecraft.world.level.storage.loot.providers.number.ints.ResolvableInt;

/**
 * Resolves a fuel item's burn duration on the client.
 *
 * <p>Minecraft 26.3 has no {@code FuelValues} / {@code level.fuelValues()} API.
 * Burn time lives on {@link DataComponents#COOKING_FUEL} as a {@link ResolvableInt}
 * that official code evaluates with a server {@code LootContext}. Constants can be
 * read without a context. Vanilla references point at
 * {@link ContextIntProviders} keys whose datapack providers are
 * {@code baseTicks / (fast furnace ? 2 : 1)}. We use those published base values
 * and apply the same fast-cooker divisor for blast furnaces and smokers.
 */
public final class FuelTimes {
	private static final Map<ResourceKey<ContextIntProvider>, Integer> VANILLA_BASE_BURN = new HashMap<>();

	static {
		VANILLA_BASE_BURN.put(ContextIntProviders.COOKING_TIME_BAMBOO, 50);
		VANILLA_BASE_BURN.put(ContextIntProviders.COOKING_TIME_WOOL_SLABS, 50);
		VANILLA_BASE_BURN.put(ContextIntProviders.COOKING_TIME_WOOL_CARPETS, 67);
		VANILLA_BASE_BURN.put(ContextIntProviders.COOKING_TIME_DRY_PLANTS, 100);
		VANILLA_BASE_BURN.put(ContextIntProviders.COOKING_TIME_WOOD_ITEMS_EXTRA_SMALL, 100);
		VANILLA_BASE_BURN.put(ContextIntProviders.COOKING_TIME_WOOL, 100);
		VANILLA_BASE_BURN.put(ContextIntProviders.COOKING_TIME_WOOD_SLABS, 150);
		VANILLA_BASE_BURN.put(ContextIntProviders.COOKING_TIME_WOOD_ITEMS_LARGE, 200);
		VANILLA_BASE_BURN.put(ContextIntProviders.COOKING_TIME_ROOTS, 300);
		VANILLA_BASE_BURN.put(ContextIntProviders.COOKING_TIME_WOOD_BLOCKS, 300);
		VANILLA_BASE_BURN.put(ContextIntProviders.COOKING_TIME_WOOD_ITEMS_SMALL, 300);
		VANILLA_BASE_BURN.put(ContextIntProviders.COOKING_TIME_HANGING_SIGNS, 800);
		VANILLA_BASE_BURN.put(ContextIntProviders.COOKING_TIME_BOATS, 1200);
		VANILLA_BASE_BURN.put(ContextIntProviders.COOKING_TIME_COAL, 1600);
		VANILLA_BASE_BURN.put(ContextIntProviders.COOKING_TIME_BLAZE_ROD, 2400);
		VANILLA_BASE_BURN.put(ContextIntProviders.COOKING_TIME_DRIED_KELP_BLOCK, 4001);
		VANILLA_BASE_BURN.put(ContextIntProviders.COOKING_TIME_COAL_BLOCK, 16000);
		VANILLA_BASE_BURN.put(ContextIntProviders.COOKING_TIME_LAVA_BUCKET, 20000);
	}

	private FuelTimes() {
	}

	public static boolean isFastCooker(AbstractFurnaceMenu menu) {
		return menu instanceof BlastFurnaceMenu || menu instanceof SmokerMenu;
	}

	/**
	 * Burn ticks for one item in this furnace, or {@code 0} if the client cannot
	 * resolve a value. {@code litDurationFallback} is the currently synced burn
	 * total, used only when the fuel component cannot be resolved.
	 */
	public static int burnTicksPerItem(ItemStack stack, AbstractFurnaceMenu menu, int litDurationFallback) {
		if (stack.isEmpty()) {
			return 0;
		}

		int factor = isFastCooker(menu) ? 2 : 1;
		CookingFuel fuel = stack.get(DataComponents.COOKING_FUEL);
		if (fuel != null) {
			ResolvableInt burnTime = fuel.burnTime();
			if (burnTime instanceof ResolvableInt.Constant constant) {
				return Math.max(1, constant.value() / factor);
			}
			if (burnTime instanceof ResolvableInt.Reference reference) {
				Integer base = VANILLA_BASE_BURN.get(reference.key());
				if (base != null) {
					return Math.max(1, base / factor);
				}
			}
		}

		return litDurationFallback > 0 ? litDurationFallback : 0;
	}
}
