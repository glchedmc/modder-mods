package mc.glched.pocketclerk;

import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

public record ClerkActionPayload(int action) implements CustomPacketPayload {
	public static final int SORT = 1;
	public static final int QUICK_STACK = 2;

	public static final CustomPacketPayload.Type<ClerkActionPayload> TYPE = new CustomPacketPayload.Type<>(PocketClerk.id("action"));
	public static final StreamCodec<RegistryFriendlyByteBuf, ClerkActionPayload> CODEC = StreamCodec.composite(
			ByteBufCodecs.VAR_INT,
			ClerkActionPayload::action,
			ClerkActionPayload::new
	);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
