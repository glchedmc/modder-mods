package mc.glched.pocketclerk;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.resources.Identifier;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class PocketClerk implements ModInitializer {
	public static final String MOD_ID = "pocket-clerk";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);
	public static PocketClerkConfig CONFIG = new PocketClerkConfig();

	@Override
	public void onInitialize() {
		CONFIG = PocketClerkConfig.load();
		PayloadTypeRegistry.serverboundPlay().register(ClerkActionPayload.TYPE, ClerkActionPayload.CODEC);
		ServerPlayNetworking.registerGlobalReceiver(ClerkActionPayload.TYPE, (payload, context) -> {
			ClerkActions.handle(context.player(), payload.action());
		});
		LOGGER.info("[pocket-clerk] ready");
	}

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}
}
