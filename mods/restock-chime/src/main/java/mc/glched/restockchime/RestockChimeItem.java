package mc.glched.restockchime;

import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.npc.villager.Villager;

public final class RestockChimeItem extends Item {
	public RestockChimeItem(Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		if (level.isClientSide()) {
			return InteractionResult.SUCCESS;
		}
		if (player.isShiftKeyDown()) {
			int cleared = RestockWatches.clear(player.getUUID());
			player.sendSystemMessage(Component.translatable("message.restock-chime.cleared", cleared));
			return InteractionResult.SUCCESS;
		}
		player.sendSystemMessage(Component.translatable("message.restock-chime.status", RestockWatches.count(player.getUUID())));
		return InteractionResult.SUCCESS;
	}

	@Override
	public InteractionResult interactLivingEntity(ItemStack stack, Player player, LivingEntity entity, InteractionHand hand) {
		if (!(entity instanceof Villager villager)) {
			return InteractionResult.PASS;
		}
		if (player.level().isClientSide()) {
			return InteractionResult.SUCCESS;
		}
		if (!(player instanceof ServerPlayer serverPlayer)) {
			return InteractionResult.FAIL;
		}
		if (villager.isBaby()) {
			player.sendSystemMessage(Component.translatable("message.restock-chime.baby"));
			return InteractionResult.FAIL;
		}
		int trades = RestockWatches.watch(serverPlayer, villager);
		if (trades < 0) {
			player.sendSystemMessage(Component.translatable("message.restock-chime.full", RestockChime.CONFIG.maxWatched));
			return InteractionResult.FAIL;
		}
		if (trades == 0) {
			player.sendSystemMessage(Component.translatable("message.restock-chime.no_trades"));
			return InteractionResult.FAIL;
		}
		if (!player.getAbilities().instabuild) {
			stack.hurtAndBreak(1, player, hand == InteractionHand.MAIN_HAND ? EquipmentSlot.MAINHAND : EquipmentSlot.OFFHAND);
		}
		player.level().playSound(null, villager.getX(), villager.getY(), villager.getZ(), SoundEvents.AMETHYST_BLOCK_CHIME, SoundSource.PLAYERS, 0.6F, 1.4F);
		return InteractionResult.SUCCESS;
	}
}
