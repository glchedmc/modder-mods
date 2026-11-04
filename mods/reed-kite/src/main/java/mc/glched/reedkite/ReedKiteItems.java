package mc.glched.reedkite;

import java.util.function.Function;

import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;

public final class ReedKiteItems {
	public static final Item REED_KITE = register("reed_kite", ReedKiteItem::new, new Item.Properties()
			.durability(384)
			.repairable(Items.PAPER));

	private ReedKiteItems() {
	}

	public static void initialize() {
	}

	private static Item register(String name, Function<Item.Properties, Item> factory, Item.Properties properties) {
		ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, ReedKite.id(name));
		Item item = factory.apply(properties.setId(key));
		return Registry.register(BuiltInRegistries.ITEM, key, item);
	}
}
