package mc.glched.swapbaton;

import java.util.function.Function;

import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;

public final class SwapBatonItems {
	public static final Item SWAP_BATON = register("swap_baton", SwapBatonItem::new, new Item.Properties()
			.durability(256)
			.repairable(Items.IRON_INGOT));

	private SwapBatonItems() {
	}

	public static void initialize() {
	}

	private static Item register(String name, Function<Item.Properties, Item> factory, Item.Properties properties) {
		ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, SwapBaton.id(name));
		Item item = factory.apply(properties.setId(key));
		return Registry.register(BuiltInRegistries.ITEM, key, item);
	}
}
