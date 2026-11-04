package mc.glched.dusksurvey;

import java.util.function.Function;

import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;

public final class DuskSurveyItems {
	public static final Item DUSK_SURVEY = register("dusk_survey", DuskSurveyItem::new, new Item.Properties()
			.durability(64)
			.repairable(Items.AMETHYST_SHARD));

	private DuskSurveyItems() {
	}

	public static void initialize() {
	}

	private static Item register(String name, Function<Item.Properties, Item> factory, Item.Properties properties) {
		ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, DuskSurvey.id(name));
		Item item = factory.apply(properties.setId(key));
		return Registry.register(BuiltInRegistries.ITEM, key, item);
	}
}
