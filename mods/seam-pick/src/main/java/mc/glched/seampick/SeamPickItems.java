package mc.glched.seampick;

import java.util.function.Function;

import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.ToolMaterial;

public final class SeamPickItems {
	public static final Item SEAM_PICK = register("seam_pick", SeamPickItem::new, new Item.Properties()
			.pickaxe(ToolMaterial.IRON, 1.0F, -2.8F)
			.durability(384)
			.repairable(Items.IRON_INGOT));

	private SeamPickItems() {
	}

	public static void initialize() {
	}

	private static Item register(String name, Function<Item.Properties, Item> factory, Item.Properties properties) {
		ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, SeamPick.id(name));
		Item item = factory.apply(properties.setId(key));
		return Registry.register(BuiltInRegistries.ITEM, key, item);
	}
}
