package mc.glched.lastlight;

import com.mojang.brigadier.CommandDispatcher;

import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.server.level.ServerPlayer;

public final class LightCommands {
	private LightCommands() {
	}

	public static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
		dispatcher.register(Commands.literal("lastlight")
				.executes(context -> {
					ServerPlayer player = context.getSource().getPlayerOrException();
					LightGuide.report(player, true);
					return 1;
				}));
	}
}
