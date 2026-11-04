package mc.glched.kilntally;

import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.block.AbstractFurnaceBlock;
import net.minecraft.world.level.block.entity.AbstractFurnaceBlockEntity;
import net.minecraft.world.level.block.state.BlockState;

public final class KilnTallyItem extends Item {
	private static final int SLOT_INPUT = 0;
	private static final int SLOT_FUEL = 1;
	private static final int SLOT_RESULT = 2;

	public KilnTallyItem(Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResult useOn(UseOnContext context) {
		BlockState state = context.getLevel().getBlockState(context.getClickedPos());
		if (!(state.getBlock() instanceof AbstractFurnaceBlock)) {
			return InteractionResult.PASS;
		}
		Player player = context.getPlayer();
		if (player == null) {
			return InteractionResult.FAIL;
		}
		if (context.getLevel().isClientSide()) {
			return InteractionResult.SUCCESS;
		}
		if (!(context.getLevel() instanceof ServerLevel level) || !(player instanceof ServerPlayer serverPlayer)) {
			return InteractionResult.FAIL;
		}
		if (!(level.getBlockEntity(context.getClickedPos()) instanceof AbstractFurnaceBlockEntity furnace)) {
			return InteractionResult.FAIL;
		}
		if (!furnace.stillValid(serverPlayer) || !level.mayInteract(serverPlayer, context.getClickedPos())) {
			return InteractionResult.FAIL;
		}
		ItemStack tally = context.getItemInHand();
		if (player.getCooldowns().isOnCooldown(tally)) {
			return InteractionResult.FAIL;
		}
		if (context.isSecondaryUseActive()) {
			return takeResult(level, serverPlayer, furnace, tally, context.getHand());
		}
		report(serverPlayer, furnace, state);
		spend(serverPlayer, tally, context.getHand(), KilnTally.CONFIG.lookDurability);
		return InteractionResult.SUCCESS;
	}

	private static void report(ServerPlayer player, AbstractFurnaceBlockEntity furnace, BlockState state) {
		boolean burning = state.getValue(AbstractFurnaceBlock.LIT);
		player.sendSystemMessage(Component.translatable(
				"message.kiln-tally.report",
				state.getBlock().getName(),
				label(furnace.getItem(SLOT_INPUT)),
				label(furnace.getItem(SLOT_FUEL)),
				label(furnace.getItem(SLOT_RESULT)),
				Component.translatable(burning ? "message.kiln-tally.burning" : "message.kiln-tally.idle")
		));
	}

	private static InteractionResult takeResult(ServerLevel level, ServerPlayer player, AbstractFurnaceBlockEntity furnace, ItemStack tally, InteractionHand hand) {
		ItemStack result = furnace.getItem(SLOT_RESULT);
		if (result.isEmpty()) {
			player.sendSystemMessage(Component.translatable("message.kiln-tally.nothing"));
			return InteractionResult.FAIL;
		}
		Component name = result.getHoverName();
		ItemStack moving = result.copy();
		int before = moving.getCount();
		player.getInventory().add(moving);
		int taken = before - moving.getCount();
		if (taken <= 0) {
			player.sendSystemMessage(Component.translatable("message.kiln-tally.full", name));
			return InteractionResult.FAIL;
		}
		result.shrink(taken);
		furnace.setItem(SLOT_RESULT, result.isEmpty() ? ItemStack.EMPTY : result);
		furnace.setChanged();
		player.sendSystemMessage(Component.translatable("message.kiln-tally.took", taken, name));
		level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.ITEM_PICKUP, SoundSource.PLAYERS, 0.5F, 1.1F);
		spend(player, tally, hand, KilnTally.CONFIG.takeDurability);
		return InteractionResult.SUCCESS;
	}

	private static void spend(ServerPlayer player, ItemStack tally, InteractionHand hand, int amount) {
		if (KilnTally.CONFIG.cooldownTicks > 0) {
			player.getCooldowns().addCooldown(tally, KilnTally.CONFIG.cooldownTicks);
		}
		if (!player.getAbilities().instabuild && amount > 0) {
			tally.hurtAndBreak(amount, player, hand == InteractionHand.MAIN_HAND ? EquipmentSlot.MAINHAND : EquipmentSlot.OFFHAND);
		}
	}

	private static Component label(ItemStack stack) {
		if (stack.isEmpty()) {
			return Component.translatable("message.kiln-tally.empty");
		}
		return Component.translatable("message.kiln-tally.stack", stack.getCount(), stack.getHoverName());
	}
}
