package mc.glched.salvagehook;

import java.util.function.Function;

import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;

public final class SalvageHookItems {
	public static final Item SALVAGE_HOOK = register("salvage_hook", SalvageHookItem::new, new Item.Properties()
			.durability(192)
			.repairable(Items.IRON_INGOT));

	private SalvageHookItems() {
	}

	public static void initialize() {
	}

	private static Item register(String name, Function<Item.Properties, Item> factory, Item.Properties properties) {
		ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, SalvageHook.id(name));
		Item item = factory.apply(properties.setId(key));
		return Registry.register(BuiltInRegistries.ITEM, key, item);
	}
}
