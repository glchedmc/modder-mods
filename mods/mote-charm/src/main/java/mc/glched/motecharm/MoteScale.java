package mc.glched.motecharm;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;

public final class MoteScale {
	private static final Identifier MODIFIER_ID = MoteCharm.id("shrink");
	private static final Map<UUID, Integer> UNTIL = new HashMap<>();
	private static final Map<UUID, Integer> NAGGED = new HashMap<>();

	private MoteScale() {
	}

	public static InteractionResult start(Player player, InteractionHand hand) {
		if (!(player instanceof ServerPlayer serverPlayer)) {
			return InteractionResult.FAIL;
		}
		if (UNTIL.containsKey(serverPlayer.getUUID())) {
			serverPlayer.sendSystemMessage(Component.translatable("message.mote-charm.busy"));
			return InteractionResult.FAIL;
		}
		if (serverPlayer.isPassenger() || serverPlayer.isSpectator() || !serverPlayer.isAlive()) {
			serverPlayer.sendSystemMessage(Component.translatable("message.mote-charm.riding"));
			return InteractionResult.FAIL;
		}
		ItemStack stack = serverPlayer.getItemInHand(hand);
		if (serverPlayer.getCooldowns().isOnCooldown(stack)) {
			serverPlayer.sendSystemMessage(Component.translatable("message.mote-charm.cooldown"));
			return InteractionResult.FAIL;
		}
		if (!apply(serverPlayer)) {
			return InteractionResult.FAIL;
		}
		UNTIL.put(serverPlayer.getUUID(), serverPlayer.level().getServer().getTickCount() + MoteCharm.CONFIG.durationTicks);
		if (!serverPlayer.getAbilities().instabuild) {
			stack.hurtAndBreak(MoteCharm.CONFIG.durability, serverPlayer, hand == InteractionHand.MAIN_HAND ? EquipmentSlot.MAINHAND : EquipmentSlot.OFFHAND);
		}
		serverPlayer.level().playSound(null, serverPlayer.getX(), serverPlayer.getY(), serverPlayer.getZ(), SoundEvents.AMETHYST_BLOCK_CHIME, SoundSource.PLAYERS, 0.7F, 1.6F);
		serverPlayer.sendSystemMessage(Component.translatable("message.mote-charm.small"));
		return InteractionResult.SUCCESS;
	}

	public static InteractionResult requestGrow(Player player) {
		if (!(player instanceof ServerPlayer serverPlayer)) {
			return InteractionResult.FAIL;
		}
		if (!UNTIL.containsKey(serverPlayer.getUUID())) {
			return InteractionResult.FAIL;
		}
		UNTIL.put(serverPlayer.getUUID(), serverPlayer.level().getServer().getTickCount());
		return InteractionResult.SUCCESS;
	}

	public static void forget(ServerPlayer player) {
		UNTIL.remove(player.getUUID());
		NAGGED.remove(player.getUUID());
		clearModifier(player);
	}

	public static void tick(MinecraftServer server) {
		if (UNTIL.isEmpty()) {
			return;
		}
		int now = server.getTickCount();
		UNTIL.entrySet().removeIf(entry -> !keep(server, entry.getKey(), entry.getValue(), now));
	}

	private static boolean keep(MinecraftServer server, UUID playerId, int until, int now) {
		ServerPlayer player = server.getPlayerList().getPlayer(playerId);
		if (player == null || !player.isAlive() || player.isSpectator()) {
			if (player != null) {
				clearModifier(player);
			}
			NAGGED.remove(playerId);
			return false;
		}
		if (now < until) {
			apply(player);
			return true;
		}
		if (!cramped(player)) {
			clearModifier(player);
			player.getCooldowns().addCooldown(new ItemStack(MoteCharmItems.MOTE_CHARM), MoteCharm.CONFIG.cooldownTicks);
			player.level().playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.ITEM_PICKUP, SoundSource.PLAYERS, 0.4F, 0.8F);
			player.sendSystemMessage(Component.translatable("message.mote-charm.grown"));
			NAGGED.remove(playerId);
			return false;
		}
		apply(player);
		int nag = NAGGED.getOrDefault(playerId, 0);
		if (now - nag > 40) {
			player.sendSystemMessage(Component.translatable("message.mote-charm.tight"));
			NAGGED.put(playerId, now);
		}
		return true;
	}

	private static boolean apply(ServerPlayer player) {
		AttributeInstance attribute = player.getAttribute(Attributes.SCALE);
		if (attribute == null) {
			return false;
		}
		if (!attribute.hasModifier(MODIFIER_ID)) {
			double amount = MoteCharm.CONFIG.scale - 1.0;
			attribute.addOrUpdateTransientModifier(new AttributeModifier(MODIFIER_ID, amount, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL));
			player.refreshDimensions();
		}
		return true;
	}

	private static void clearModifier(ServerPlayer player) {
		AttributeInstance attribute = player.getAttribute(Attributes.SCALE);
		if (attribute != null && attribute.removeModifier(MODIFIER_ID)) {
			player.refreshDimensions();
		}
	}

	private static boolean cramped(ServerPlayer player) {
		clearModifier(player);
		boolean stuck = player.isInWall() || !player.level().noCollision(player);
		if (stuck) {
			apply(player);
		}
		return stuck;
	}
}
